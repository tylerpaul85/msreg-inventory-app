import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Camera, Navigation, Hash, CheckCircle, AlertCircle, Loader, 
  ArrowRight, RotateCcw, User, MapPin, Layers, Key, Lock, Plus, Trash2 
} from 'lucide-react';

export default function FieldDashboard({ session, onNavigate }) {
  const [scanning, setScanning] = useState(false);
  const [manualId, setManualId] = useState('');
  const [scannedItems, setScannedItems] = useState([]);
  const [isScanningMore, setIsScanningMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
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

  const assetInfo = scannedItems.length === 1 
    ? getAssetTypeInfo(scannedItems[0].label) 
    : { displayName: 'Item', type: 'Listing Sign', icon: Layers };

  // Geolocation State
  const [gpsLoading, setGpsLoading] = useState(false);
  const [coords, setCoords] = useState(null);
  
  // Action State
  const [action, setAction] = useState('');
  const [notes, setNotes] = useState('');
  
  // New Fields: Anonymous Custody & Property Address (split into Street + City)
  const [agentName, setAgentName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [propertyCity, setPropertyCity] = useState('');

  // Confirm overlay
  const [showConfirmOverlay, setShowConfirmOverlay] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  
  // Camera hardware list states
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  
  const qrScannerRef = useRef(null);
  const scannerContainerId = "field-qr-reader";

  // Pre-fill agent name and discover camera hardware
  useEffect(() => {
    if (session?.user) {
      fetchUserFullName(session.user.id);
    } else {
      setAgentName('');
    }

    // List available camera devices
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length > 0) {
        setCameras(devices);
        // Default to back/rear camera on mobile if available, otherwise first device
        const backCam = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') || 
          d.label.toLowerCase().includes('environment') ||
          d.label.toLowerCase().includes('camera 0')
        );
        setSelectedCameraId(backCam ? backCam.id : devices[0].id);
      }
    }).catch(err => {
      console.warn('Unable to retrieve camera hardware list:', err);
    });
  }, [session]);

  const fetchUserFullName = async (userId) => {
    try {
      const { data, error: profileErr } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();
      if (!profileErr && data) {
        setAgentName(data.full_name);
      }
    } catch (err) {
      console.error('Error fetching name for prefill:', err);
    }
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Request GPS automatically when items are resolved
  useEffect(() => {
    if (scannedItems.length > 0 && !coords && !gpsLoading) {
      requestGPS();
    }
  }, [scannedItems]);

  const requestGPS = () => {
    setGpsLoading(true);
    setError('');
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setGpsLoading(false);
      },
      (err) => {
        console.error(err);
        setError('Failed to obtain GPS coordinates. Location access is required to track physical asset placements.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const startScanner = async () => {
    setError('');
    setScanning(true);

    // Default to first camera if not loaded yet
    let targetCameraId = selectedCameraId;
    if (!targetCameraId) {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameras(devices);
          targetCameraId = devices[0].id;
          setSelectedCameraId(targetCameraId);
        }
      } catch (err) {
        console.warn('Fallback camera scan failed:', err);
      }
    }

    if (!targetCameraId) {
      setError('No camera hardware detected on this device.');
      setScanning(false);
      return;
    }

    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode(scannerContainerId);
        qrScannerRef.current = html5QrCode;

        await html5QrCode.start(
          targetCameraId,
          {
            fps: 10
          },
          (decodedText) => {
            handleQrResolved(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.error(err);
        setError('Could not start camera feed. Ensure permissions are granted or try selecting a different camera.');
        setScanning(false);
      }
    }, 100);
  };

  const handleCameraChange = async (cameraId) => {
    setSelectedCameraId(cameraId);
    if (scanning) {
      await stopScanner();
      setScanning(true);
      
      setTimeout(async () => {
        try {
          const html5QrCode = new Html5Qrcode(scannerContainerId);
          qrScannerRef.current = html5QrCode;
          
          await html5QrCode.start(
            cameraId,
            {
              fps: 10
            },
            (decodedText) => handleQrResolved(decodedText),
            () => {}
          );
        } catch (err) {
          console.error(err);
          setError('Failed to start camera device.');
          setScanning(false);
        }
      }, 100);
    }
  };

  const stopScanner = async () => {
    if (qrScannerRef.current && qrScannerRef.current.isScanning) {
      try {
        await qrScannerRef.current.stop();
      } catch (err) {
        console.error('Failed to stop scanner:', err);
      }
    }
    setScanning(false);
  };

  const extractTokenOrId = (raw) => {
    if (!raw) return '';
    let cleaned = raw.trim();
    try {
      if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        const url = new URL(cleaned);
        const tokenParam = url.searchParams.get('token') || url.searchParams.get('qr_token') || url.searchParams.get('id');
        if (tokenParam) return tokenParam.trim();
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length > 0) cleaned = segments[segments.length - 1];
      }
    } catch (e) {
      // not a URL, use raw string
    }
    return cleaned;
  };

  const handleQrResolved = async (qrToken) => {
    await stopScanner();
    setLoading(true);
    setError('');

    const cleanToken = extractTokenOrId(qrToken);

    try {
      // 1. Try exact qr_token lookup
      let { data, error: fetchError } = await supabase
        .from('signs')
        .select('*')
        .eq('qr_token', cleanToken)
        .maybeSingle();

      // 2. Fallback: Try lookup by short_id if direct token match returned no rows
      if (!data) {
        const paddedShortId = cleanToken.padStart(3, '0');
        const { data: shortIdData } = await supabase
          .from('signs')
          .select('*')
          .or(`short_id.eq.${cleanToken},short_id.eq.${paddedShortId}`)
          .maybeSingle();

        if (shortIdData) {
          data = shortIdData;
        }
      }

      if (fetchError) {
        if (fetchError.code === 'PGRST205' || fetchError.message?.includes('schema cache')) {
          throw new Error('Database table "signs" not found. Please run the migration script in supabase_schema.sql via your Supabase SQL Editor.');
        }
        throw fetchError;
      }

      if (!data) {
        throw new Error(`Item not found for QR token "${cleanToken}". Verify the code and try again.`);
      }

      setScannedItems(prev => {
        if (prev.some(item => item.id === data.id)) {
          setError('This item has already been added to the current batch.');
          return prev;
        }
        return [...prev, data];
      });
      setIsScanningMore(false);
    } catch (err) {
      console.error('QR resolution error:', err);
      setError(err.message || 'Error resolving QR code.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSearch = async (e) => {
    e.preventDefault();
    if (!manualId.trim()) return;

    setLoading(true);
    setError('');
    await stopScanner();

    const searchStr = manualId.trim();
    const paddedShortId = searchStr.padStart(3, '0');

    try {
      const { data, error: fetchError } = await supabase
        .from('signs')
        .select('*')
        .or(`short_id.eq.${searchStr},short_id.eq.${paddedShortId},qr_token.eq.${searchStr}`)
        .maybeSingle();

      if (fetchError) {
        if (fetchError.code === 'PGRST205' || fetchError.message?.includes('schema cache')) {
          throw new Error('Database table "signs" not found. Please run the migration script in supabase_schema.sql via your Supabase SQL Editor.');
        }
        throw fetchError;
      }

      if (!data) {
        throw new Error(`Item with ID or token "${searchStr}" not found. Verify the number printed on the label.`);
      }

      setScannedItems(prev => {
        if (prev.some(item => item.id === data.id)) {
          setError('This item has already been added to the current batch.');
          return prev;
        }
        return [...prev, data];
      });
      setIsScanningMore(false);
      setManualId('');
    } catch (err) {
      setError(err.message || 'Manual lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setScannedItems([]);
    setIsScanningMore(false);
    setCoords(null);
    setAction('');
    setNotes('');
    setManualId('');
    setError('');
    setStreetAddress('');
    setPropertyCity('');
    setShowConfirmOverlay(false);
    setShowNotes(false);
    if (!session) setAgentName('');
    stopScanner();
  };

  const handleSubmitAction = async () => {
    if (scannedItems.length === 0) return;
    if (!action) {
      setError('Please select one of the actions.');
      return;
    }
    if (!agentName.trim()) {
      setError('Your Name/Initials are required to log actions.');
      return;
    }
    if (action === 'deliver' && !streetAddress.trim()) {
      setError('Street Address is required for placing items.');
      return;
    }
    if (!coords) {
      setError('GPS coordinates are required to submit this scan.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Loop through all scanned items in the batch and submit logs
      for (const item of scannedItems) {
        const { error: rpcError } = await supabase.rpc('log_scan', {
          p_sign_id: item.id,
          p_action: action,
          p_latitude: coords.latitude,
          p_longitude: coords.longitude,
          p_notes: notes.trim() || null,
          p_agent_name: agentName.trim(),
          p_property_address: action === 'deliver' ? (propertyCity.trim() ? `${streetAddress.trim()}, ${propertyCity.trim()}, MO` : streetAddress.trim()) : null
        });

        if (rpcError) throw rpcError;
      }

      // Navigate to confirmation screen
      onNavigate('confirmation', {
        signShortId: scannedItems.map(item => item.short_id).join(', '),
        action: action,
        coords: coords,
        notes: notes,
        agentName: agentName,
        propertyAddress: action === 'deliver' ? (propertyCity.trim() ? `${streetAddress.trim()}, ${propertyCity.trim()}, MO` : streetAddress.trim()) : null,
        assetTypeName: scannedItems.length === 1 
          ? getAssetTypeInfo(scannedItems[0].label).displayName 
          : 'Batch Items'
      });

    } catch (err) {
      setError(err.message || 'Failed to log scan activity.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '16px', maxWidth: '500px', margin: '0 auto 80px auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700 }}>
            {scannedItems.length > 0 ? 'Batch Scan Assets' : 'Scan Yard Sign & Lockbox'}
          </h2>
          <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '13px' }}>
            {scannedItems.length > 0 ? `Manage batch action for ${scannedItems.length} scanned items` : 'Report sign or lockbox status instantly'}
          </p>
        </div>
        {scannedItems.length > 0 && (
          <button onClick={resetAll} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }}>
            <RotateCcw size={14} /> Reset
          </button>
        )}
      </div>

      {error && (
        <div className="animate-fade-in" style={{
          display: 'flex',
          gap: '10px',
          padding: '14px 18px',
          background: 'hsl(var(--danger) / 0.05)',
          border: '1px solid hsl(var(--danger) / 0.15)',
          borderLeft: '4px solid hsl(var(--danger))',
          borderRadius: 'var(--radius-sm)',
          color: 'hsl(var(--danger))',
          fontSize: '13.5px',
          marginBottom: '20px',
          lineHeight: '1.45'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2.5px' }} />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
          <Loader size={32} className="animate-spin" style={{ color: 'hsl(var(--primary))', marginBottom: '12px' }} />
          <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px' }}>Saving scan details...</p>
        </div>
      )}

      {/* STEP 1: RESOLVE THE SIGN */}
      {(scannedItems.length === 0 || isScanningMore) && !loading && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Scanner Box */}
          <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
            {scanning ? (
              <div>
                {/* Camera dropdown selector */}
                {cameras.length > 1 && (
                  <div style={{ marginBottom: '16px', textAlign: 'left' }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Switch Camera Lens</label>
                    <select
                      className="form-input"
                      value={selectedCameraId}
                      onChange={(e) => handleCameraChange(e.target.value)}
                      style={{ cursor: 'pointer', height: '38px', padding: '6px 10px', fontSize: '13px' }}
                    >
                      {cameras.map(cam => (
                        <option key={cam.id} value={cam.id}>
                          {cam.label || `Camera Device ${cam.id.substring(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div id={scannerContainerId} style={{ 
                  width: '100%', 
                  aspectRatio: '1', 
                  maxHeight: '280px', 
                  borderRadius: '10px', 
                  overflow: 'hidden', 
                  margin: '0 auto 16px auto',
                  background: '#000000',
                  border: '1px solid hsl(var(--border-color))'
                }}></div>
                <button onClick={stopScanner} className="btn btn-danger" style={{ width: '100%' }}>
                  Cancel Scanner
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '20px', padding: '6px 0' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', textAlign: 'left' }}>
                  <div style={{
                    color: 'hsl(var(--primary))',
                    marginTop: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Camera size={26} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '6px', letterSpacing: '-0.01em' }}>
                      {scannedItems.length > 0 ? 'Scan Next Item' : 'Scan Asset QR Code'}
                    </h3>
                    <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '13px', lineHeight: '1.45' }}>
                      Point your camera at the QR code printed on the sign, Supra, or lockbox to add it to the current custody update.
                    </p>
                  </div>
                </div>
                <button onClick={startScanner} className="btn btn-primary" style={{ width: '100%', padding: '13px', letterSpacing: '0.02em' }}>
                  <Camera size={16} /> Start Camera Scan
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'center', gap: '12px', color: 'hsl(var(--text-muted))', fontSize: '13px' }}>
            <div style={{ height: '1px', background: 'hsl(var(--border-color))', flexGrow: 1 }}></div>
            <span>OR ENTER MANUALLY</span>
            <div style={{ height: '1px', background: 'hsl(var(--border-color))', flexGrow: 1 }}></div>
          </div>

          {/* Manual Entry Fallback */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Hash size={16} style={{ color: 'hsl(var(--primary))' }} /> Type Short ID Fallback
            </h3>
            <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Enter item number (e.g. 042)"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                style={{ flexGrow: 1 }}
              />
              <button type="submit" className="btn btn-secondary" style={{ padding: '0 16px', fontSize: '14px' }}>
                Resolve
              </button>
            </form>
          </div>

          {/* Show current batch if scanning more */}
          {isScanningMore && scannedItems.length > 0 && (
            <div className="glass-panel animate-fade-in" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', color: 'hsl(var(--text-secondary))' }}>
                  Current Batch ({scannedItems.length})
                </h4>
                <button 
                  onClick={() => setIsScanningMore(false)} 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                >
                  Back to Log Form
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {scannedItems.map((item) => {
                  const typeInfo = getAssetTypeInfo(item.label);
                  return (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'hsl(var(--bg-app) / 0.5)', padding: '8px 12px', borderRadius: '6px', border: '1px solid hsl(var(--border-color))' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{typeInfo.displayName} #{item.short_id}</span>
                      <button 
                        type="button"
                        onClick={() => {
                          setScannedItems(prev => prev.filter(x => x.id !== item.id));
                        }} 
                        style={{ background: 'none', border: 'none', color: 'hsl(var(--danger))', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: LOG ACTION FOR RESOLVED BATCH */}
      {scannedItems.length > 0 && !isScanningMore && !loading && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ⚠️ Don't Forget Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: 'hsl(var(--warning) / 0.1)',
            border: '1px solid hsl(var(--warning) / 0.35)',
            borderLeft: '4px solid hsl(var(--warning))',
            borderRadius: '8px'
          }}>
            <span style={{ fontSize: '22px', flexShrink: 0 }}>⚠️</span>
            <div>
              <p style={{ fontWeight: 900, fontSize: '13.5px', color: 'hsl(var(--warning))', letterSpacing: '0.02em' }}>DON’T FORGET TO HIT SUBMIT!</p>
              <p style={{ fontSize: '11.5px', color: 'hsl(var(--text-secondary))', marginTop: '2px' }}>Tap an action below, then confirm in the popup to log this scan.</p>
            </div>
          </div>

          {/* Batch Details Header Card */}
          <div className="glass-panel" style={{ padding: '16px 20px', borderLeft: '4px solid hsl(var(--primary))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'hsl(var(--primary))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Scanned Items ({scannedItems.length})
              </span>
              <button
                type="button"
                onClick={() => setIsScanningMore(true)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={12} /> Add Another
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {scannedItems.map((item) => {
                const typeInfo = getAssetTypeInfo(item.label);
                const ItemIcon = typeInfo.icon;
                return (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'hsl(var(--bg-app) / 0.3)', borderRadius: '6px', border: '1px solid hsl(var(--border-color))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ItemIcon size={14} style={{ color: 'hsl(var(--primary))' }} />
                      <span style={{ color: 'hsl(var(--text-primary))', fontWeight: 700, fontSize: '13.5px' }}>
                        {typeInfo.displayName} #{item.short_id}
                      </span>
                      {item.label && (
                        <span style={{ color: 'hsl(var(--text-muted))', fontSize: '11px' }}>
                          ({item.label})
                        </span>
                      )}
                    </div>
                    {scannedItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setScannedItems(prev => prev.filter(x => x.id !== item.id));
                        }}
                        style={{ background: 'none', border: 'none', color: 'hsl(var(--danger))', cursor: 'pointer', fontSize: '12px', padding: '2px 4px' }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>


          {/* User Name Input (Required for custody logging) */}
          <div className="glass-panel" style={{ padding: '16px 20px' }}>
            <label className="form-label" htmlFor="agentName">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={14} style={{ color: 'hsl(var(--primary))' }} />
                Your Name / Initials *
              </span>
            </label>
            <input
              id="agentName"
              type="text"
              className="form-input"
              placeholder="e.g. John Smith"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              disabled={!!session} // Locked to auth name if logged in
            />
            {!session && (
              <p style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>
                Since you are scanning without logging in, we require your name to track custody.
              </p>
            )}
          </div>

          {/* Action Choice Grid */}
          <div className="glass-panel" style={{ padding: '16px 20px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'hsl(var(--text-secondary))', marginBottom: '12px' }}>
              Select Status Action
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { id: 'pickup', label: 'Pickup', desc: 'From office/site' },
                { id: 'deliver', label: scannedItems.length === 1 ? `${assetInfo.displayName} Placed` : 'Assets Placed', desc: 'Drop at property' },
                { id: 'return', label: 'Return', desc: 'Back to office' }
              ].map((act) => {
                const isActive = action === act.id;
                return (
                  <button
                    key={act.id}
                    onClick={() => {
                      setAction(act.id);
                      if (act.id !== 'deliver') { setStreetAddress(''); setPropertyCity(''); }
                      setShowNotes(false);
                      setError('');
                      setShowConfirmOverlay(true);
                    }}
                    type="button"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '10px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid ' + (isActive ? 'hsl(var(--primary))' : 'hsl(var(--border-color))'),
                      background: isActive ? 'hsl(var(--primary) / 0.08)' : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--text-primary))' }}>
                      {act.label}
                    </span>
                    <span style={{ fontSize: '10px', color: 'hsl(var(--text-muted))', marginTop: '2px', lineHeight: '1.2' }}>
                      {act.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Property Address Input (Street + City, only shown for 'deliver') */}
          {action === 'deliver' && (
            <div className="glass-panel animate-fade-in" style={{ padding: '16px 20px', borderLeft: '4px solid hsl(var(--success))', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="form-label" htmlFor="propAddr">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} style={{ color: 'hsl(var(--success))' }} />
                    Street Address *
                  </span>
                </label>
                <input
                  id="propAddr"
                  type="text"
                  className="form-input"
                  placeholder="e.g. 713 Missouri Ave"
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="form-label" htmlFor="propCity" style={{ fontSize: '11px' }}>
                  City <span style={{ color: 'hsl(var(--text-muted))', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id="propCity"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Farmington"
                  value={propertyCity}
                  onChange={(e) => setPropertyCity(e.target.value)}
                />
              </div>
              <p style={{ fontSize: '11px', color: 'hsl(var(--text-muted))' }}>
                Required for placements to track the active property location.
              </p>
            </div>
          )}

          {/* GPS Coordinates Capture */}
          <div className="glass-panel" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'hsl(var(--text-secondary))', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Navigation size={14} style={{ color: coords ? 'hsl(var(--success))' : 'hsl(var(--primary))' }} />
                GPS Coordinates
              </h4>
              <button 
                onClick={requestGPS} 
                className="btn btn-secondary" 
                style={{ padding: '4px 8px', fontSize: '11px' }}
                disabled={gpsLoading}
              >
                {gpsLoading ? 'Locating...' : 'Retry Location'}
              </button>
            </div>
            
            {gpsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'hsl(var(--text-secondary))', fontSize: '13px', padding: '6px 0' }}>
                <Loader size={12} className="animate-spin" />
                <span>Acquiring high-accuracy GPS coordinates...</span>
              </div>
            ) : coords ? (
              <div style={{ padding: '8px 12px', background: 'hsl(var(--success) / 0.05)', border: '1px solid hsl(var(--success) / 0.15)', borderRadius: '6px' }}>
                <p style={{ color: 'hsl(var(--success))', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle size={12} /> Location Verified
                </p>
                <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '12px', fontFamily: 'monospace', marginTop: '2px' }}>
                  Lat: {coords.latitude.toFixed(6)}, Lng: {coords.longitude.toFixed(6)}
                </p>
              </div>
            ) : (
              <div style={{ padding: '8px 12px', background: 'hsl(var(--danger) / 0.05)', border: '1px solid hsl(var(--danger) / 0.15)', borderRadius: '6px' }}>
                <p style={{ color: 'hsl(var(--danger))', fontSize: '13px', fontWeight: 600 }}>
                  GPS Acquisition Missing
                </p>
                <p style={{ color: 'hsl(var(--text-muted))', fontSize: '11px', marginTop: '1px' }}>
                  Please enable GPS permissions in your browser and reload coordinates.
                </p>
              </div>
            )}
          </div>

          {/* Optional Notes */}
          <div className="glass-panel" style={{ padding: '16px 20px' }}>
            <label className="form-label" htmlFor="notes">Scan Notes (Optional)</label>
            <textarea
              id="notes"
              className="form-input"
              rows={2}
              placeholder="e.g. Placed left of mailbox, keybox code is 1234, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ resize: 'none' }}
            />
          </div>

          {/* Log Submit Button */}
          <button
            onClick={handleSubmitAction}
            className="btn btn-primary"
            disabled={!action || !agentName.trim() || (action === 'deliver' && !streetAddress.trim()) || !coords || loading}
            style={{ padding: '14px', fontSize: '15px', display: 'flex', justifyContent: 'center', gap: '6px' }}
          >
            Submit Action <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* ====== CONFIRM ACTION BOTTOM SHEET OVERLAY ====== */}
      {showConfirmOverlay && action && (
        <div
          className="animate-fade-in"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(5, 9, 20, 0.88)',
            backdropFilter: 'blur(10px)',
            zIndex: 500,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end'
          }}
        >
          <div style={{
            background: 'hsl(var(--bg-card))',
            borderRadius: '20px 20px 0 0',
            padding: '8px 20px 24px 20px',
            maxHeight: '92vh',
            overflowY: 'auto',
            borderTop: '2px solid hsl(var(--primary) / 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>

            {/* Drag handle */}
            <div style={{ width: '44px', height: '4px', background: 'hsl(var(--border-color))', borderRadius: '2px', margin: '10px auto 2px auto' }} />

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '10px', color: 'hsl(var(--primary))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Confirm &amp; Submit</p>
                <h3 style={{ fontSize: '21px', fontWeight: 800 }}>
                  {action === 'pickup' ? '🔄 Pickup' : action === 'deliver' ? '📍 Place at Property' : '🏢 Return to Office'}
                </h3>
              </div>
              <button
                onClick={() => setShowConfirmOverlay(false)}
                style={{ background: 'none', border: '1px solid hsl(var(--border-color))', color: 'hsl(var(--text-secondary))', cursor: 'pointer', fontSize: '13px', padding: '6px 12px', borderRadius: '6px', fontWeight: 600 }}
              >
                ← Change
              </button>
            </div>

            {/* Items being actioned */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {scannedItems.map(item => {
                const typeInfo = getAssetTypeInfo(item.label);
                const ItemIcon = typeInfo.icon;
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'hsl(var(--primary) / 0.06)', borderRadius: '8px', border: '1px solid hsl(var(--primary) / 0.2)' }}>
                    <ItemIcon size={15} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>{typeInfo.displayName} #{item.short_id}</span>
                    {item.label && <span style={{ fontSize: '11px', color: 'hsl(var(--text-muted))' }}>({item.label})</span>}
                  </div>
                );
              })}
            </div>

            {/* Agent Name */}
            <div>
              <label className="form-label" htmlFor="overlayAgentName">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={13} style={{ color: 'hsl(var(--primary))' }} /> Your Name *
                </span>
              </label>
              <input
                id="overlayAgentName"
                type="text"
                className="form-input"
                placeholder="e.g. John Smith"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                disabled={!!session}
                autoFocus={!session && action !== 'deliver'}
              />
              {!session && (
                <p style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>Required to track custody for anonymous scans.</p>
              )}
            </div>

            {/* Property Address — deliver only (Street + City) */}
            {action === 'deliver' && (
              <div style={{ borderLeft: '4px solid hsl(var(--success))', paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label className="form-label" htmlFor="overlayStreet">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={13} style={{ color: 'hsl(var(--success))' }} /> Street Address *
                    </span>
                  </label>
                  <input
                    id="overlayStreet"
                    type="text"
                    className="form-input"
                    placeholder="e.g. 713 Missouri Ave"
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="overlayCity" style={{ fontSize: '11px' }}>
                    City <span style={{ color: 'hsl(var(--text-muted))', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    id="overlayCity"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Farmington"
                    value={propertyCity}
                    onChange={(e) => setPropertyCity(e.target.value)}
                  />
                </div>
                <p style={{ fontSize: '11px', color: 'hsl(var(--text-muted))' }}>Required to track where this item is placed.</p>
              </div>
            )}

            {/* GPS Status */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              background: coords ? 'hsl(var(--success) / 0.06)' : 'hsl(var(--danger) / 0.06)',
              borderRadius: '8px',
              border: `1px solid ${coords ? 'hsl(var(--success) / 0.2)' : 'hsl(var(--danger) / 0.2)'}`
            }}>
              {gpsLoading ? (
                <>
                  <Loader size={14} className="animate-spin" style={{ color: 'hsl(var(--primary))' }} />
                  <span style={{ fontSize: '13px', color: 'hsl(var(--text-secondary))' }}>Acquiring GPS location...</span>
                </>
              ) : coords ? (
                <>
                  <CheckCircle size={14} style={{ color: 'hsl(var(--success))' }} />
                  <span style={{ fontSize: '13px', color: 'hsl(var(--success))', fontWeight: 600 }}>
                    GPS Ready — {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
                  </span>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={14} style={{ color: 'hsl(var(--danger))' }} />
                    <span style={{ fontSize: '13px', color: 'hsl(var(--danger))', fontWeight: 600 }}>GPS not acquired</span>
                  </div>
                  <button
                    onClick={requestGPS}
                    style={{ background: 'hsl(var(--primary) / 0.1)', border: '1px solid hsl(var(--primary) / 0.3)', color: 'hsl(var(--primary))', cursor: 'pointer', fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px' }}
                  >
                    Retry GPS
                  </button>
                </div>
              )}
            </div>

            {/* Notes — hidden by default, reveal on tap */}
            {showNotes ? (
              <div>
                <label className="form-label" htmlFor="overlayNotes">Scan Notes (Optional)</label>
                <textarea
                  id="overlayNotes"
                  className="form-input"
                  rows={2}
                  placeholder="e.g. Placed left of mailbox, keybox code is 1234..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ resize: 'none' }}
                  autoFocus
                />
              </div>
            ) : (
              <button
                onClick={() => setShowNotes(true)}
                type="button"
                style={{ background: 'none', border: '1px dashed hsl(var(--border-color))', color: 'hsl(var(--text-muted))', cursor: 'pointer', padding: '10px', borderRadius: '8px', fontSize: '13px', width: '100%', textAlign: 'center' }}
              >
                + Add a note (optional)
              </button>
            )}

            {/* Error display inside overlay */}
            {error && (
              <div style={{ display: 'flex', gap: '10px', padding: '12px 16px', background: 'hsl(var(--danger) / 0.05)', border: '1px solid hsl(var(--danger) / 0.2)', borderLeft: '4px solid hsl(var(--danger))', borderRadius: '8px', color: 'hsl(var(--danger))', fontSize: '13px' }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{error}</span>
              </div>
            )}

            {/* === THE BIG SUBMIT BUTTON === */}
            <button
              onClick={handleSubmitAction}
              className="btn btn-primary"
              disabled={!agentName.trim() || (action === 'deliver' && !streetAddress.trim()) || !coords || loading || gpsLoading}
              style={{
                padding: '18px',
                fontSize: '18px',
                fontWeight: 900,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '10px',
                borderRadius: '14px',
                letterSpacing: '0.02em',
                boxShadow: '0 8px 24px hsl(var(--primary) / 0.35)'
              }}
            >
              {loading ? (
                <><Loader size={20} className="animate-spin" /> Submitting...</>
              ) : (
                <><CheckCircle size={20} /> Confirm &amp; Submit</>
              )}
            </button>

            <div style={{ height: '8px' }} />
          </div>
        </div>
      )}
    </div>
  );
}
