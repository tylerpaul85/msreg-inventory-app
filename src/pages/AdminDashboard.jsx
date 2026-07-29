import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import QRCode from 'qrcode';
import { 
  Plus, Search, Filter, Calendar, MapPin, 
  Layers, User, Clock, FileText, CheckCircle, 
  Printer, ArrowLeft, Loader, Trash2, Map as MapIcon, 
  List as ListIcon, Route, ArrowRight, Edit, Save, X,
  Key, Lock
} from 'lucide-react';

export default function AdminDashboard({ session }) {
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory', 'logs', 'create', 'detail'
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState('Listing Sign');
  
  // Data States
  const [signs, setSigns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Search and status filters (Inventory list)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Map Action Filter State (Logs map)
  const [mapFilters, setMapFilters] = useState({
    deliver: true,
    pickup: true,
    return: true
  });
  
  // Sign Detail Timeline State
  const [selectedSign, setSelectedSign] = useState(null);
  const [signHistory, setSignHistory] = useState([]);
  
  // Administrative Override Edit State
  const [editingSignId, setEditingSignId] = useState(null);
  const [editStatus, setEditStatus] = useState('');
  const [editHolderName, setEditHolderName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editLabel, setEditLabel] = useState('');

  // Create / Batch print States
  const [newLabel, setNewLabel] = useState('');
  const [batchCount, setBatchCount] = useState(1);
  const [createdSigns, setCreatedSigns] = useState([]); // Temporary holder for newly created batch to print
  const [qrCodes, setQrCodes] = useState({}); // mapping: qr_token -> dataURL
  
  // Single QR code modal and printing states
  const [qrModalSign, setQrModalSign] = useState(null);
  const [modalQrUrl, setModalQrUrl] = useState('');
  
  // Map elements refs
  const logsMapRef = useRef(null);
  const logsMapInstanceRef = useRef(null);
  const logsMarkersRef = useRef([]); // track markers to add/remove dynamically
  
  const detailMapRef = useRef(null);
  const detailMapInstanceRef = useRef(null);

  // Fetch initial data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch signs with details
      const { data: signsData, error: signsErr } = await supabase
        .from('signs')
        .select('*')
        .order('short_id', { ascending: true });

      if (signsErr) throw signsErr;
      setSigns(signsData || []);

      // Fetch profiles
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, full_name, role');
      
      if (profilesErr) throw profilesErr;
      setProfiles(profilesData || []);

      // Fetch scan logs
      await fetchLogs();

    } catch (err) {
      setError(err.message || 'Error loading dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    const { data: logsData, error: logsErr } = await supabase
      .from('scans')
      .select(`
        *,
        signs(short_id, label)
      `)
      .order('created_at', { ascending: false });

    if (logsErr) throw logsErr;
    setLogs(logsData || []);
  };

  // Initialize map when entering logs tab
  useEffect(() => {
    if (activeTab === 'logs' && logsMapRef.current && logs.length > 0) {
      setTimeout(() => {
        initLogsMap();
      }, 200);
    }
  }, [activeTab, logs]);

  // Update map markers when filters change
  useEffect(() => {
    if (activeTab === 'logs' && logsMapInstanceRef.current) {
      updateLogsMapMarkers();
    }
  }, [mapFilters, activeTab]);

  const initLogsMap = () => {
    // Clear previous instance
    if (logsMapInstanceRef.current) {
      logsMapInstanceRef.current.remove();
    }

    const validScans = logs.filter(l => l.latitude && l.longitude);
    if (validScans.length === 0) return;

    // Start center at first log
    const map = window.L.map(logsMapRef.current).setView([validScans[0].latitude, validScans[0].longitude], 12);
    logsMapInstanceRef.current = map;

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    updateLogsMapMarkers();
  };

  const updateLogsMapMarkers = () => {
    const map = logsMapInstanceRef.current;
    if (!map) return;

    // Clear existing markers
    logsMarkersRef.current.forEach(marker => map.removeLayer(marker));
    logsMarkersRef.current = [];

    // Filter logs based on map action selections
    const filteredScans = logs.filter(scan => {
      if (!scan.latitude || !scan.longitude) return false;
      return mapFilters[scan.action] === true;
    });

    // Plot matching markers
    filteredScans.forEach(scan => {
      const marker = window.L.marker([scan.latitude, scan.longitude]).addTo(map);
      marker.bindPopup(`
        <div style="font-family: Outfit, sans-serif; padding: 4px; color: #1e293b;">
          <h4 style="margin: 0; font-size:14px; font-weight:800; color: #111112;">Sign #${scan.signs?.short_id}</h4>
          <p style="margin:4px 0 0 0; font-size:12px;">Action: <b style="text-transform:uppercase;">${scan.action}</b></p>
          <p style="margin:2px 0 0 0; font-size:12px;">Logged by: <b>${scan.agent_name || 'Agent'}</b></p>
          ${scan.property_address ? `<p style="margin:4px 0 0 0; font-size:11px; color:#c2410c; background: #fff7ed; padding: 4px; border-radius: 4px;">📍 ${scan.property_address}</p>` : ''}
          ${scan.notes ? `<p style="margin:4px 0 0 0; font-size:11px; font-style:italic; color:#64748b;">"${scan.notes}"</p>` : ''}
          <p style="margin:4px 0 0 0; font-size:10px; color:#94a3b8;">${new Date(scan.created_at).toLocaleString()}</p>
        </div>
      `);
      logsMarkersRef.current.push(marker);
    });
  };

  // Render sign journey map on timeline detail open
  useEffect(() => {
    if (selectedSign && activeTab === 'detail' && detailMapRef.current && signHistory.length > 0) {
      setTimeout(() => {
        initDetailMap();
      }, 200);
    }
  }, [activeTab, selectedSign, signHistory]);

  const initDetailMap = () => {
    if (detailMapInstanceRef.current) {
      detailMapInstanceRef.current.remove();
    }

    const pathPoints = [...signHistory]
      .reverse() // Sort chronologically to trace the route
      .filter(h => h.latitude && h.longitude);

    if (pathPoints.length === 0) return;

    const map = window.L.map(detailMapRef.current).setView([pathPoints[pathPoints.length - 1].latitude, pathPoints[pathPoints.length - 1].longitude], 13);
    detailMapInstanceRef.current = map;

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const latlngs = pathPoints.map(p => [p.latitude, p.longitude]);

    // Plot route polyline path connecting the timeline pins
    if (latlngs.length > 1) {
      window.L.polyline(latlngs, { 
        color: '#111112', 
        weight: 3,
        dashArray: '5, 8',
        lineJoin: 'round'
      }).addTo(map);
    }

    // Add marker pins indicating journey order
    pathPoints.forEach((point, idx) => {
      const marker = window.L.marker([point.latitude, point.longitude]).addTo(map);
      marker.bindPopup(`
        <div style="font-family: Outfit, sans-serif; padding: 2px; color: #1e293b;">
          <b style="font-size: 13px; color: #111112;">Stop #${idx + 1}: ${point.action.toUpperCase()}</b>
          <p style="margin:2px 0 0 0; font-size: 11px;">Agent: <b>${point.agent_name || 'Anonymous'}</b></p>
          ${point.property_address ? `<p style="margin:2px 0 0 0; font-size: 11px; color:#c2410c;">Address: ${point.property_address}</p>` : ''}
          <p style="margin:2px 0 0 0; font-size: 10px; color:#64748b;">${new Date(point.created_at).toLocaleString()}</p>
        </div>
      `);
    });
  };

  const handleOpenDetail = async (signItem) => {
    setLoading(true);
    setSelectedSign(signItem);
    setActiveTab('detail');

    try {
      const { data, error: histErr } = await supabase
        .from('scans')
        .select('*')
        .eq('sign_id', signItem.id)
        .order('created_at', { ascending: false });

      if (histErr) throw histErr;
      setSignHistory(data || []);
    } catch (err) {
      setError(err.message || 'Failed to retrieve history log.');
    } finally {
      setLoading(false);
    }
  };

  const generateQRCodeURL = async (token) => {
    if (!token) return '';
    try {
      return await QRCode.toDataURL(token, {
        width: 400,
        margin: 4,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error('QR generation failed:', err);
      return '';
    }
  };

  const getAssetTypeInfo = (label) => {
    const lbl = (label || '').toLowerCase();
    if (lbl.includes('supra')) {
      return { type: 'Supra', displayName: 'Supra', icon: Key };
    } else if (lbl.includes('lockbox')) {
      return { type: 'Other Lockbox', displayName: 'Other Lockbox', icon: Lock };
    } else {
      return { type: 'Listing Sign', displayName: 'Listing Sign', icon: Layers };
    }
  };

  const handleViewQrModal = async (signItem) => {
    setQrModalSign(signItem);
    setModalQrUrl('');
    const qrUrl = qrCodes[signItem.qr_token] || await generateQRCodeURL(signItem.qr_token);
    setModalQrUrl(qrUrl);
    if (!qrCodes[signItem.qr_token]) {
      setQrCodes(prev => ({ ...prev, [signItem.qr_token]: qrUrl }));
    }
  };

  const handlePrintSingleSign = async (signItem) => {
    const qrUrl = qrCodes[signItem.qr_token] || await generateQRCodeURL(signItem.qr_token);
    const typeInfo = getAssetTypeInfo(signItem.label);
    
    const printWindow = window.open('', '_blank', 'width=600,height=600');
    if (!printWindow) {
      alert('Pop-up blocked! Please allow pop-ups for this website to print.');
      return;
    }
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Print ${typeInfo.displayName} #${signItem.short_id}</title>
          <style>
            body {
              font-family: 'Outfit', -apple-system, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: white;
              color: black;
            }
            .card {
              border: 3px dashed #000000;
              padding: 30px;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              width: 320px;
              box-sizing: border-box;
            }
            .qr-img {
              width: 220px;
              height: 220px;
            }
            .id-label {
              font-size: 30px;
              font-weight: 900;
              margin-top: 15px;
              letter-spacing: 0.05em;
              text-transform: uppercase;
            }
            .token-label {
              font-size: 11px;
              color: #555;
              margin-top: 4px;
              font-family: monospace;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <img class="qr-img" src="${qrUrl}" />
            <div class="id-label">${typeInfo.displayName} #${signItem.short_id}</div>
            <div class="token-label">${signItem.qr_token}</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleBatchCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setCreatedSigns([]);

    try {
      let lastNum = 0;
      if (signs.length > 0) {
        const numbers = signs.map(s => parseInt(s.short_id, 10)).filter(n => !isNaN(n));
        if (numbers.length > 0) {
          lastNum = Math.max(...numbers);
        }
      }

      const newSignsToInsert = [];
      const codesMap = {};

      for (let i = 1; i <= batchCount; i++) {
        const nextNum = lastNum + i;
        const shortId = String(nextNum).padStart(3, '0');
        const qrToken = `MSREG-${shortId}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        
        newSignsToInsert.push({
          short_id: shortId,
          qr_token: qrToken,
          label: newLabel ? (batchCount > 1 ? `${newLabel} (${i})` : newLabel) : `${selectedAssetType} ${shortId}`,
          status: 'return',
          current_holder: null,
          current_holder_name: null,
          last_property_address: null
        });

        const qrUrl = await generateQRCodeURL(qrToken);
        codesMap[qrToken] = qrUrl;
      }

      // Bulk Insert into Supabase
      const { data, error: insertErr } = await supabase
        .from('signs')
        .insert(newSignsToInsert)
        .select();

      if (insertErr) throw insertErr;

      setQrCodes(prev => ({ ...prev, ...codesMap }));
      setCreatedSigns(data || []);
      setNewLabel('');
      setBatchCount(1);
      
      await fetchData();

    } catch (err) {
      setError(err.message || 'Failed to create batch signs.');
    } finally {
      setLoading(false);
    }
  };

  // Direct manual sign properties override (For back-end internal corrections)
  const handleStartEdit = (signItem) => {
    setEditingSignId(signItem.id);
    setEditStatus(signItem.status);
    setEditHolderName(signItem.current_holder_name || '');
    setEditAddress(signItem.last_property_address || '');
    setEditLabel(signItem.label || '');
  };

  const handleSaveEdit = async (signId) => {
    setLoading(true);
    setError('');

    try {
      const nextAddress = editStatus === 'deliver' ? editAddress.trim() : null;
      const nextHolder = editStatus === 'pickup' ? editHolderName.trim() : null;

      const { error: updateErr } = await supabase
        .from('signs')
        .update({
          status: editStatus,
          current_holder_name: nextHolder || null,
          last_property_address: nextAddress || null,
          label: editLabel.trim() || null
        })
        .eq('id', signId);

      if (updateErr) throw updateErr;

      setEditingSignId(null);
      await fetchData(); // Refresh list
    } catch (err) {
      setError(err.message || 'Failed to save administrative updates.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSign = async (id) => {
    if (!window.confirm('Are you absolutely sure you want to delete this sign? All historical scans associated with it will also be deleted.')) return;
    
    setLoading(true);
    try {
      const { error: delError } = await supabase
        .from('signs')
        .delete()
        .eq('id', id);

      if (delError) throw delError;

      if (selectedSign && selectedSign.id === id) {
        setSelectedSign(null);
        setActiveTab('inventory');
      }
      
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to delete sign.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const toggleMapFilter = (actionType) => {
    setMapFilters(prev => ({
      ...prev,
      [actionType]: !prev[actionType]
    }));
  };

  const setOnlyDeliveries = () => {
    setMapFilters({
      deliver: true,
      pickup: false,
      return: false
    });
  };

  const resetMapFilters = () => {
    setMapFilters({
      deliver: true,
      pickup: true,
      return: true
    });
  };

  // Filtered inventory computing
  const filteredSigns = signs.filter(sign => {
    const searchVal = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      sign.short_id.includes(searchVal) || 
      (sign.label && sign.label.toLowerCase().includes(searchVal)) ||
      (sign.current_holder_name && sign.current_holder_name.toLowerCase().includes(searchVal)) ||
      (sign.last_property_address && sign.last_property_address.toLowerCase().includes(searchVal));
      
    const matchesStatus = statusFilter === '' || sign.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ padding: '24px 16px', maxWidth: '1000px', margin: '0 auto 80px auto' }}>
      
      {/* Header bar */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 800 }}>Admin Dashboard</h2>
          <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '13px' }}>Yard Sign Inventory Management & Logs</p>
        </div>
        
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '6px', background: 'hsl(var(--bg-card))', padding: '4px', borderRadius: '8px', border: '1px solid hsl(var(--border-color))' }}>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`btn ${activeTab === 'inventory' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px' }}
          >
            <Layers size={13} /> Inventory
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`btn ${activeTab === 'logs' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px' }}
          >
            <Clock size={13} /> Scan Log
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className={`btn ${activeTab === 'create' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px' }}
          >
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {error && (
        <div className="no-print" style={{
          padding: '12px 16px',
          background: 'hsl(var(--danger) / 0.12)',
          border: '1px solid hsl(var(--danger) / 0.25)',
          borderRadius: '8px',
          color: 'hsl(var(--danger))',
          fontSize: '13px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {loading && !createdSigns.length && (
        <div className="no-print" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0' }}>
          <Loader size={32} className="animate-spin" style={{ color: 'hsl(var(--primary))', marginBottom: '12px' }} />
          <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px' }}>Updating dashboard...</p>
        </div>
      )}

      {/* TAB 1: INVENTORY LISTING & ADMINISTRATIVE OVERRIDES */}
      {activeTab === 'inventory' && !loading && (
        <div className="animate-fade-in no-print" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Controls Bar */}
          <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div style={{ flexGrow: 1, position: 'relative', minWidth: '220px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--text-muted))' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search sign ID, address, holder..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '38px', height: '40px' }}
              />
            </div>
            
            <div style={{ minWidth: '150px' }}>
              <select
                className="form-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ cursor: 'pointer', height: '40px' }}
              >
                <option value="">All Statuses</option>
                <option value="pickup">Picked Up</option>
                <option value="deliver">Sign Placed</option>
                <option value="return">Returned</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '16px', fontSize: '13px', marginLeft: 'auto', padding: '0 8px', color: 'hsl(var(--text-secondary))' }}>
              <span>Total: <b style={{ color: 'hsl(var(--primary))' }}>{signs.length}</b></span>
              <span>Active Placements: <b style={{ color: 'hsl(var(--success))' }}>{signs.filter(s => s.status === 'deliver').length}</b></span>
            </div>
          </div>

          {/* Grid Layout of Signs */}
          {filteredSigns.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
              No signs match the current search filters.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {filteredSigns.map(sign => {
                const isEditing = editingSignId === sign.id;
                const { displayName, icon: IconComponent } = getAssetTypeInfo(sign.label);
                
                return (
                  <div key={sign.id} className="glass-panel" style={{ 
                    padding: '20px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'space-between', 
                    gap: '12px',
                    border: isEditing ? '1px solid hsl(var(--primary))' : '1px solid hsl(var(--border-color))',
                    boxShadow: isEditing ? 'var(--shadow-glow)' : 'none'
                  }}>
                    
                    {/* Inline edit mode */}
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid hsl(var(--border-color))', paddingBottom: '8px' }}>
                          <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'hsl(var(--primary))' }}>Override {displayName} #{sign.short_id}</h4>
                          <button onClick={() => setEditingSignId(null)} style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}>
                            <X size={16} />
                          </button>
                        </div>
                        
                        <div>
                          <label className="form-label" style={{ fontSize: '10px', marginBottom: '2px' }}>Label / Description</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={editLabel} 
                            onChange={(e) => setEditLabel(e.target.value)} 
                            style={{ height: '36px', padding: '6px 10px', fontSize: '13px' }}
                          />
                        </div>

                        <div>
                          <label className="form-label" style={{ fontSize: '10px', marginBottom: '2px' }}>Override Status</label>
                          <select 
                            className="form-input" 
                            value={editStatus} 
                            onChange={(e) => setEditStatus(e.target.value)}
                            style={{ height: '36px', padding: '6px 10px', fontSize: '13px' }}
                          >
                            <option value="pickup">Picked Up</option>
                            <option value="deliver">Sign Placed</option>
                            <option value="return">Returned</option>
                          </select>
                        </div>

                        {editStatus === 'pickup' && (
                          <div>
                            <label className="form-label" style={{ fontSize: '10px', marginBottom: '2px' }}>Holder Name</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              placeholder="e.g. John Doe"
                              value={editHolderName} 
                              onChange={(e) => setEditHolderName(e.target.value)} 
                              style={{ height: '36px', padding: '6px 10px', fontSize: '13px' }}
                            />
                          </div>
                        )}

                        {editStatus === 'deliver' && (
                          <div>
                            <label className="form-label" style={{ fontSize: '10px', marginBottom: '2px' }}>Property Address</label>
                            <input 
                              type="text" 
                              className="form-input" 
                              placeholder="e.g. 102 West Oak St"
                              value={editAddress} 
                              onChange={(e) => setEditAddress(e.target.value)} 
                              style={{ height: '36px', padding: '6px 10px', fontSize: '13px' }}
                            />
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                          <button
                            onClick={() => handleSaveEdit(sign.id)}
                            className="btn btn-primary"
                            style={{ flexGrow: 1, padding: '8px', fontSize: '13px' }}
                          >
                            <Save size={14} /> Save Changes
                          </button>
                          <button
                            onClick={() => setEditingSignId(null)}
                            className="btn btn-secondary"
                            style={{ padding: '8px', fontSize: '13px' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <IconComponent size={16} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
                              <h4 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{displayName} #{sign.short_id}</h4>
                            </div>
                            <p style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>Created {new Date(sign.created_at).toLocaleDateString()}</p>
                          </div>
                          <span className={`badge badge-${sign.status}`}>
                            {sign.status === 'deliver' ? 'Sign Placed' : sign.status === 'pickup' ? 'Picked Up' : 'Returned'}
                          </span>
                        </div>

                        {sign.label && (
                          <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '13px' }}>{sign.label}</p>
                        )}

                        <div style={{ height: '1px', background: 'hsl(var(--border-color))' }}></div>

                        {/* Custody Info */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                          
                          {/* Holder Name display */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <User size={13} style={{ color: 'hsl(var(--text-muted))' }} />
                            <span style={{ color: 'hsl(var(--text-muted))' }}>Custody:</span>
                            <span style={{ color: sign.current_holder_name ? 'hsl(var(--text-primary))' : 'hsl(var(--text-muted))', fontWeight: sign.current_holder_name ? 600 : 400 }}>
                              {sign.current_holder_name ? sign.current_holder_name : (sign.status === 'deliver' ? 'Listing Location' : 'Storage (Office)')}
                            </span>
                          </div>

                          {/* Property Address display (If deliver) */}
                          {sign.status === 'deliver' && sign.last_property_address && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '2px' }}>
                              <MapPin size={13} style={{ color: 'hsl(var(--success))', marginTop: '2px', flexShrink: 0 }} />
                              <div>
                                <span style={{ color: 'hsl(var(--text-muted))', fontSize: '12px' }}>Property:</span>
                                <p style={{ color: 'hsl(var(--text-primary))', fontWeight: 600, fontSize: '13px' }}>
                                  {sign.last_property_address}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{ height: '1px', background: 'hsl(var(--border-color))' }}></div>

                        {/* Actions buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleOpenDetail(sign)}
                              className="btn btn-secondary"
                              style={{ flexGrow: 1, padding: '8px 12px', fontSize: '12px' }}
                            >
                              Timeline
                            </button>
                            <button
                              onClick={() => handleViewQrModal(sign)}
                              className="btn btn-secondary"
                              style={{ flexGrow: 1, padding: '8px 12px', fontSize: '12px', border: '1px solid hsl(var(--primary) / 0.3)' }}
                            >
                              View QR
                            </button>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleStartEdit(sign)}
                              className="btn btn-secondary"
                              style={{ flexGrow: 1, padding: '6px', fontSize: '12px', display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}
                              title="Override Sign Status"
                            >
                              <Edit size={12} style={{ color: 'hsl(var(--primary))' }} /> Override
                            </button>

                            <button
                              onClick={() => handleDeleteSign(sign.id)}
                              className="btn btn-danger"
                              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="Delete Sign"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COMPLETE SCAN LOG MAP & LIST */}
      {activeTab === 'logs' && !loading && (
        <div className="animate-fade-in no-print" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px', height: '600px', '@media (max-width: 768px)': { gridTemplateColumns: '1fr', height: 'auto' } }}>
          
          {/* Map Section */}
          <div className="glass-panel" style={{ height: '100%', position: 'relative', overflow: 'hidden', minHeight: '350px' }}>
            
            {/* Interactive Filters Panel directly overlaying map */}
            <div style={{ 
              position: 'absolute', 
              top: '12px', 
              left: '12px', 
              zIndex: 10, 
              background: 'hsl(var(--bg-card) / 0.9)', 
              backdropFilter: 'blur(8px)',
              padding: '12px', 
              borderRadius: '8px', 
              border: '1px solid hsl(var(--border-color))',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxWidth: '240px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid hsl(var(--border-color))', paddingBottom: '6px', marginBottom: '2px' }}>
                <MapIcon size={13} style={{ color: 'hsl(var(--primary))' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter Map Actions</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                  { id: 'deliver', label: '📍 Placed Signs', color: 'hsl(var(--success))' },
                  { id: 'pickup', label: '🔄 Picked Up', color: 'hsl(var(--warning))' },
                  { id: 'return', label: '🏢 Returned Storage', color: 'hsl(var(--text-secondary))' }
                ].map(item => (
                  <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={mapFilters[item.id]} 
                      onChange={() => toggleMapFilter(item.id)}
                      style={{ accentColor: 'hsl(var(--primary))' }}
                    />
                    <span style={{ color: mapFilters[item.id] ? item.color : 'hsl(var(--text-muted))', fontWeight: mapFilters[item.id] ? 600 : 400 }}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>

              {/* Fast presets */}
              <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid hsl(var(--border-color))', paddingTop: '6px', marginTop: '2px' }}>
                <button 
                  onClick={setOnlyDeliveries} 
                  className="btn btn-secondary" 
                  style={{ flexGrow: 1, padding: '4px 6px', fontSize: '10px', borderRadius: '4px', border: '1px solid hsl(var(--success) / 0.3)' }}
                >
                  Deliveries Only
                </button>
                <button 
                  onClick={resetMapFilters} 
                  className="btn btn-secondary" 
                  style={{ flexGrow: 1, padding: '4px 6px', fontSize: '10px', borderRadius: '4px' }}
                >
                  Show All
                </button>
              </div>
            </div>
            
            <div ref={logsMapRef} style={{ height: '100%', width: '100%' }}></div>
          </div>

          {/* List panel */}
          <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid hsl(var(--border-color))', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ListIcon size={14} style={{ color: 'hsl(var(--primary))' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scan Activity Log</h3>
            </div>
            
            <div style={{ overflowY: 'auto', flexGrow: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {logs.length === 0 ? (
                <p style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '20px', fontSize: '13px' }}>No scan events logged yet.</p>
              ) : (
                logs.map(log => (
                  <div key={log.id} style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'hsl(var(--bg-app) / 0.4)',
                    border: '1px solid hsl(var(--border-color))',
                    fontSize: '13px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 800, color: 'hsl(var(--text-primary))' }}>Sign #{log.signs?.short_id}</span>
                      <span className={`badge badge-${log.action}`} style={{ fontSize: '10px', padding: '2px 8px' }}>
                        {log.action === 'deliver' ? 'Sign Placed' : log.action === 'pickup' ? 'Picked Up' : 'Returned'}
                      </span>
                    </div>
                    
                    <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '12px' }}>
                      Logged by: <b style={{ color: 'hsl(var(--text-primary))' }}>{log.agent_name || 'Anonymous Agent'}</b>
                    </p>

                    {log.action === 'deliver' && log.property_address && (
                      <p style={{ 
                        margin: '4px 0', 
                        fontSize: '12px', 
                        color: 'hsl(var(--success))', 
                        background: 'hsl(var(--success) / 0.05)', 
                        padding: '4px 8px', 
                        borderRadius: '4px',
                        border: '1px solid hsl(var(--success) / 0.1)'
                      }}>
                        📍 {log.property_address}
                      </p>
                    )}

                    {log.notes && (
                      <p style={{ 
                        fontStyle: 'italic', 
                        color: 'hsl(var(--text-muted))', 
                        margin: '4px 0', 
                        borderLeft: '2px solid hsl(var(--border-color))', 
                        paddingLeft: '6px',
                        fontSize: '11px' 
                      }}>
                        "{log.notes}"
                      </p>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '10px', color: 'hsl(var(--text-muted))' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <MapPin size={10} /> {log.latitude.toFixed(4)}, {log.longitude.toFixed(4)}
                      </span>
                      <span>{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(log.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CREATE SIGNS & BATCH PRINT LAYOUT */}
      {activeTab === 'create' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="glass-panel no-print" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Plus size={18} style={{ color: 'hsl(var(--primary))' }} /> Generate {selectedAssetType}s
              </h3>
              <button 
                type="button"
                onClick={() => setShowAddModal(true)} 
                className="btn btn-secondary" 
                style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                Change Type
              </button>
            </div>
            
            <form onSubmit={handleBatchCreate} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
              <div style={{ flexGrow: 2, minWidth: '220px' }}>
                <label className="form-label" htmlFor="newLabel">Batch Labels (Optional Description)</label>
                <input
                  id="newLabel"
                  type="text"
                  className="form-input"
                  placeholder={`e.g. ${selectedAssetType} - North Side`}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>

              <div style={{ width: '120px' }}>
                <label className="form-label" htmlFor="batchCount">Quantity</label>
                <input
                  id="batchCount"
                  type="number"
                  min="1"
                  max="50"
                  className="form-input"
                  value={batchCount}
                  onChange={(e) => setBatchCount(parseInt(e.target.value, 10) || 1)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ padding: '12px 24px', flexGrow: 1 }}
              >
                {loading ? 'Creating...' : 'Generate Batch'}
              </button>
            </form>
          </div>

          {/* Printable Labels Display Section */}
          {createdSigns.length > 0 && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="glass-panel no-print" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'hsl(var(--primary) / 0.05)' }}>
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700 }}>Generated {createdSigns.length} Labels for Printing</h4>
                  <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '12px' }}>Press Print to generate print preview.</p>
                </div>
                <button onClick={handlePrint} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                  <Printer size={15} /> Print QR Labels
                </button>
              </div>

              {/* Renders standard label output cards for printing */}
              <div className="print-page print-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '20px',
                padding: '10px'
              }}>
                {createdSigns.map(sign => (
                  <div key={sign.id} className="print-card" style={{
                    background: 'white',
                    color: 'black',
                    padding: '20px',
                    borderRadius: '10px',
                    textAlign: 'center',
                    border: '2px dashed #000000',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}>
                    {qrCodes[sign.qr_token] ? (
                      <img 
                        src={qrCodes[sign.qr_token]} 
                        alt={`QR code for ${sign.short_id}`} 
                        style={{ width: '150px', height: '150px' }}
                      />
                    ) : (
                      <div style={{ width: '150px', height: '150px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                        Loading QR...
                      </div>
                    )}
                    <div>
                      <div className="id-label" style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        {selectedAssetType} #{sign.short_id}
                      </div>
                      <div style={{ fontSize: '9px', color: '#777', marginTop: '1px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                        {sign.qr_token}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SIGN DETAIL TIMELINE & ROUTE JOURNEY */}
      {activeTab === 'detail' && selectedSign && (
        <div className="animate-fade-in no-print" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Header Card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={() => {
                setSelectedSign(null);
                setSignHistory([]);
                setActiveTab('inventory');
              }}
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '13px' }}
            >
              <ArrowLeft size={14} /> Back
            </button>
             <h3 style={{ fontSize: '20px', fontWeight: 800 }}>
              {(() => {
                const { displayName } = getAssetTypeInfo(selectedSign.label);
                return `History for ${displayName} #${selectedSign.short_id}`;
              })()}
            </h3>
            {selectedSign.label && (
              <span style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px' }}>— {selectedSign.label}</span>
            )}
          </div>

          {/* Double Column Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', minHeight: '400px', '@media (max-width: 768px)': { gridTemplateColumns: '1fr' } }}>
            
            {/* Journey Map */}
            <div className="glass-panel" style={{ height: '100%', minHeight: '350px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 10, background: 'hsl(var(--bg-card) / 0.9)', padding: '6px 12px', borderRadius: '6px', border: '1px solid hsl(var(--border-color))', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <Route size={12} style={{ color: 'hsl(var(--primary))' }} /> Physical Journey Trail
              </div>
              <div ref={detailMapRef} style={{ height: '100%', width: '100%' }}></div>
            </div>

            {/* Timeline */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--text-secondary))', marginBottom: '20px' }}>
                Sign Events Timeline
              </h4>
              
              <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '20px', borderLeft: '2px solid hsl(var(--border-color))' }}>
                {signHistory.length === 0 ? (
                  <p style={{ color: 'hsl(var(--text-muted))', fontStyle: 'italic', fontSize: '13px' }}>No logs recorded for this sign yet.</p>
                ) : (
                  signHistory.map((hist, idx) => (
                    <div key={hist.id} style={{ position: 'relative', marginBottom: '4px' }}>
                      {/* Circle indicator pin */}
                      <div style={{
                        position: 'absolute',
                        left: '-26px',
                        top: '4px',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: idx === 0 ? 'hsl(var(--primary))' : 'hsl(var(--border-color))',
                        border: '2px solid hsl(var(--bg-card))',
                        boxShadow: idx === 0 ? '0 0 8px hsl(var(--primary))' : 'none'
                      }}></div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '13px' }}>
                        <span style={{ fontWeight: 800, color: 'hsl(var(--text-primary))' }}>
                          {hist.action.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '10px', color: 'hsl(var(--text-muted))' }}>
                          {new Date(hist.created_at).toLocaleString()}
                        </span>
                      </div>
                      
                      <p style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))', marginTop: '2px' }}>
                        Agent: <b>{hist.agent_name || 'Anonymous Agent'}</b>
                      </p>

                      {hist.action === 'deliver' && hist.property_address && (
                        <p style={{ 
                          fontSize: '12px', 
                          color: 'hsl(var(--success))', 
                          fontWeight: 600, 
                          marginTop: '2px', 
                          background: 'hsl(var(--success) / 0.05)', 
                          padding: '4px 8px', 
                          borderRadius: '4px',
                          display: 'inline-block' 
                        }}>
                          📍 {hist.property_address}
                        </p>
                      )}

                      {hist.notes && (
                        <p style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', fontStyle: 'italic', background: 'hsl(var(--bg-app) / 0.3)', padding: '6px', borderRadius: '4px', marginTop: '4px' }}>
                          "{hist.notes}"
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* QR Code Modal Overlay */}
      {qrModalSign && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 9, 20, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }} className="no-print">
          <div className="glass-panel animate-fade-in" style={{
            width: '100%',
            maxWidth: '380px',
            padding: '24px',
            textAlign: 'center',
            background: 'hsl(var(--bg-card))',
            border: '1px solid hsl(var(--primary) / 0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid hsl(var(--border-color))', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'hsl(var(--text-primary))' }}>
                {(() => {
                  const { displayName } = getAssetTypeInfo(qrModalSign.label);
                  return `${displayName} QR Code`;
                })()}
              </h3>
              <button 
                onClick={() => setQrModalSign(null)} 
                style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ 
              background: 'white', 
              padding: '16px', 
              borderRadius: '12px', 
              display: 'inline-block',
              boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
              border: '1px solid hsl(var(--border-color))',
              marginBottom: '20px'
            }}>
              {modalQrUrl ? (
                <img 
                  src={modalQrUrl} 
                  alt="QR Code" 
                  style={{ width: '180px', height: '180px', display: 'block' }}
                />
              ) : (
                <div style={{ width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                  <Loader className="animate-spin" size={20} />
                </div>
              )}
              <div style={{ fontSize: '20px', fontWeight: 900, color: 'black', letterSpacing: '0.05em', marginTop: '10px', textTransform: 'uppercase' }}>
                {(() => {
                  const { displayName } = getAssetTypeInfo(qrModalSign.label);
                  return `${displayName} #${qrModalSign.short_id}`;
                })()}
              </div>
              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {qrModalSign.qr_token}
              </div>
            </div>

            {qrModalSign.label && (
              <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '13px', marginBottom: '20px' }}>
                {qrModalSign.label}
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handlePrintSingleSign(qrModalSign)}
                className="btn btn-primary"
                style={{ flexGrow: 1, padding: '12px', fontSize: '13px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                disabled={!modalQrUrl}
              >
                <Printer size={14} /> Download PDF
              </button>
              <button
                onClick={() => setQrModalSign(null)}
                className="btn btn-secondary"
                style={{ padding: '12px 16px', fontSize: '13px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Asset Selection Modal Overlay */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 9, 20, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }} className="no-print">
          <div className="glass-panel animate-fade-in" style={{
            width: '100%',
            maxWidth: '440px',
            padding: '28px',
            background: 'hsl(var(--bg-card))',
            border: '1px solid hsl(var(--primary) / 0.3)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid hsl(var(--border-color))', paddingBottom: '12px', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'hsl(var(--text-primary))' }}>Add New Inventory Item</h3>
              <button 
                onClick={() => setShowAddModal(false)} 
                style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '13.5px', marginBottom: '20px', textAlign: 'center' }}>
              Select the type of inventory asset you would like to generate:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {[
                { type: 'Listing Sign', desc: 'Real estate yard signs and riders', icon: Layers, color: '#fafafb' },
                { type: 'Supra', desc: 'Electronic key box for property showings', icon: Key, color: '#6366f1' },
                { type: 'Other Lockbox', desc: 'Combination lockboxes and other storage keyboxes', icon: Lock, color: '#10b981' }
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.type}
                    onClick={() => {
                      setSelectedAssetType(option.type);
                      setNewLabel(option.type);
                      setCreatedSigns([]); // Reset printed sheet
                      setActiveTab('create');
                      setShowAddModal(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '16px',
                      borderRadius: '10px',
                      border: '1px solid hsl(var(--border-color))',
                      background: 'hsl(var(--bg-app) / 0.3)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    className="add-option-btn"
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: `${option.color}15`,
                      border: `1px solid ${option.color}30`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: option.color
                    }}>
                      <Icon size={20} />
                    </div>
                    <div style={{ flexGrow: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'hsl(var(--text-primary))' }}>{option.type}</div>
                      <div style={{ fontSize: '12px', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>{option.desc}</div>
                    </div>
                    <ArrowRight size={16} style={{ color: 'hsl(var(--text-muted))' }} />
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddModal(false)}
                className="btn btn-secondary"
                style={{ padding: '10px 20px', fontSize: '13px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
