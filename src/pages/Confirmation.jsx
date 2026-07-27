import React from 'react';
import { CheckCircle2, ArrowLeft, Navigation, FileText, Calendar, User, MapPin } from 'lucide-react';

export default function Confirmation({ state, onNavigate }) {
  const { signShortId, action, coords, notes, agentName, propertyAddress, assetTypeName = 'Listing Sign' } = state || {};

  const getActionDetails = (act) => {
    switch (act) {
      case 'checkout':
        return { label: 'Checked Out', desc: `${assetTypeName} is in custody`, color: 'hsl(var(--primary))' };
      case 'deliver':
        return { label: 'Delivered', desc: `${assetTypeName} placed at property`, color: 'hsl(var(--success))' };
      case 'pickup':
        return { label: 'Picked Up', desc: `${assetTypeName} retrieved and in transit`, color: 'hsl(var(--warning))' };
      case 'return':
        return { label: 'Returned', desc: `${assetTypeName} returned to storage`, color: 'hsl(var(--text-secondary))' };
      default:
        return { label: 'Logged', desc: 'Action logged successfully', color: 'hsl(var(--text-primary))' };
    }
  };

  const details = getActionDetails(action);

  return (
    <div style={{
      padding: '24px 16px',
      maxWidth: '460px',
      margin: '40px auto 80px auto',
      textAlign: 'center'
    }}>
      <div className="animate-fade-in" style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'hsl(var(--success))',
        marginBottom: '16px'
      }}>
        <CheckCircle2 size={48} strokeWidth={1.5} />
      </div>

      <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>Scan Logged Successfully</h2>
      <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '14px', marginBottom: '28px' }}>
        Database record updated in real-time
      </p>

      {/* Confirmation Card */}
      <div className="glass-panel animate-fade-in" style={{
        padding: '20px 24px',
        textAlign: 'left',
        marginBottom: '28px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid hsl(var(--border-color))',
          paddingBottom: '12px',
          marginBottom: '14px'
        }}>
          <div>
            <span style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', fontWeight: 700, textTransform: 'uppercase' }}>{assetTypeName} Details</span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'hsl(var(--text-primary))' }}>{assetTypeName} #{signShortId || 'N/A'}</h3>
          </div>
          <span className={`badge badge-${action}`} style={{ fontSize: '12px', padding: '6px 12px' }}>
            {details.label}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Logged By Agent */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <User size={15} style={{ color: 'hsl(var(--text-muted))', marginTop: '2px' }} />
            <div>
              <span style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', fontWeight: 700 }}>LOGGED BY</span>
              <p style={{ fontSize: '14px', color: 'hsl(var(--text-secondary))', marginTop: '1px', fontWeight: 600 }}>
                {agentName || 'Anonymous Agent'}
              </p>
            </div>
          </div>

          {/* Property Address */}
          {action === 'deliver' && propertyAddress && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <MapPin size={15} style={{ color: 'hsl(var(--success))', marginTop: '2px' }} />
              <div>
                <span style={{ fontSize: '11px', color: 'hsl(var(--success))', fontWeight: 700 }}>PROPERTY ADDRESS</span>
                <p style={{ fontSize: '14px', color: 'hsl(var(--text-primary))', marginTop: '1px', fontWeight: 600 }}>
                  {propertyAddress}
                </p>
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Calendar size={15} style={{ color: 'hsl(var(--text-muted))', marginTop: '2px' }} />
            <div>
              <span style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', fontWeight: 700 }}>TIMESTAMP</span>
              <p style={{ fontSize: '13px', color: 'hsl(var(--text-secondary))', marginTop: '1px' }}>
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* GPS Coordinates */}
          {coords && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <Navigation size={15} style={{ color: 'hsl(var(--text-muted))', marginTop: '2px' }} />
              <div>
                <span style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', fontWeight: 700 }}>GPS POSITION</span>
                <p style={{ fontSize: '13px', color: 'hsl(var(--text-secondary))', marginTop: '1px', fontFamily: 'monospace' }}>
                  {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          {notes && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <FileText size={15} style={{ color: 'hsl(var(--text-muted))', marginTop: '2px' }} />
              <div>
                <span style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', fontWeight: 700 }}>SCAN NOTES</span>
                <p style={{ fontSize: '13px', color: 'hsl(var(--text-secondary))', marginTop: '1px', fontStyle: 'italic' }}>
                  "{notes}"
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => onNavigate('field')}
        className="btn btn-primary"
        style={{ width: '100%', padding: '12px' }}
      >
        <ArrowLeft size={16} /> Scan Another Item
      </button>
    </div>
  );
}
