import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.js';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { fmtTime } from '../utils.js';

function todayStr() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts();
  const value = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission is blocked. Click the lock icon beside the address bar, allow Camera, then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found. Connect or enable a webcam, then try again.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is being used by another app. Close that app and try again.';
    default:
      return 'Could not start the camera. Allow camera permission and use HTTPS (or localhost).';
  }
}

export default function Attendance() {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [result, setResult] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const inputRef = useRef(null);
  const scannerRef = useRef(null);
  const scannerStopPromiseRef = useRef(Promise.resolve());

  async function loadAttendance() {
    setLoading(true);
    setError('');
    try {
      const data = await api('/attendance?date=' + date);
      setRows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAttendance(); }, [date]);

  // Camera start/stop operations must be serialised. In React Strict Mode an
  // effect may be mounted, cleaned up, and mounted again quickly; calling
  // Html5Qrcode.stop() while start() is still pending leaves some browsers
  // without a usable camera stream.
  useEffect(() => {
    if (!scannerOpen) return undefined;
    let cancelled = false;
    let scanned = false;
    let scanner = null;
    let started = false;

    async function beginScanning() {
      await scannerStopPromiseRef.current;
      if (cancelled) return;

      // Asking for the list first makes the browser select a real device. This
      // works with desktop webcams too, where an environment-facing camera
      // constraint can fail before the permission prompt is shown.
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) throw new DOMException('No camera available', 'NotFoundError');
        const camera = cameras.find(({ label }) => /back|rear|environment/i.test(label)) || cameras[0];
        if (cancelled) return;

        scanner = new Html5Qrcode('qr-reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
        scannerRef.current = scanner;
        await scanner.start(
          camera.id,
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (value) => {
            if (cancelled || scanned) return;
            scanned = true;
            const qrValue = value.trim();
            setIdentifier(qrValue);
            setScannerOpen(false);
            checkInFromQr(qrValue);
          },
          () => {},
        );
        started = true;
      } catch (err) {
        if (!cancelled) {
          setScannerError(cameraErrorMessage(err));
          setScannerOpen(false);
        }
      }
    }

    const startPromise = beginScanning();
    return () => {
      cancelled = true;
      // Wait for a pending start before stopping. This also makes the next
      // scanner session wait until this camera has been released.
      scannerStopPromiseRef.current = startPromise.catch(() => {}).then(async () => {
        if (scannerRef.current === scanner) scannerRef.current = null;
        if (scanner && started) {
          try { await scanner.stop(); } catch (_) { /* Camera is already stopped. */ }
        }
        if (scanner) {
          try { await scanner.clear(); } catch (_) { /* Nothing left to clear. */ }
        }
      });
    };
  }, [scannerOpen]);

  function startScanner() {
    if (scannerOpen) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setScannerError('Camera scanning requires HTTPS (or localhost). Open the admin site through a secure URL, then try again.');
      return;
    }
    setScannerError('');
    setScannerOpen(true);
  }

  function stopScanner() { setScannerOpen(false); }

  async function checkInFromQr(value) {
    if (!value.trim()) return;
    try {
      const res = await api('/attendance/checkin', { method: 'POST', body: JSON.stringify({ identifier: value.trim() }) });
      setResult({ action: 'Checked IN', member: res.member });
      toast(`Checked IN: ${res.member.full_name}`);
      setIdentifier('');
      inputRef.current?.focus();
      loadAttendance();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleCheckout(e) {
    e.preventDefault();
    if (!identifier.trim()) return;
    try {
      const res = await api('/attendance/checkout', { method: 'POST', body: JSON.stringify({ identifier: identifier.trim() }) });
      setResult({ action: 'Checked OUT', member: res.member });
      toast(`Checked OUT: ${res.member.full_name}`);
      setIdentifier('');
      inputRef.current?.focus();
      loadAttendance();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <div className="page-header">
        <div><h2>Attendance</h2><p>QR scan for check-in and member code for check-out</p></div>
      </div>

      <div className="panel">
        <h3 className="mt-0">Check-in / Check-out</h3>
        <div className="pill-row" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <label>Member check-in</label>
            <button className="btn btn-primary" type="button" onClick={startScanner}>Scan QR to Check In</button>
          </div>
        </div>
        <form onSubmit={handleCheckout} className="pill-row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
            <label>Member ID or Member Code for check-out</label>
            <input ref={inputRef} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="e.g. SFC0007" autoFocus required />
          </div>
          <button className="btn btn-ghost" type="submit">Check Out</button>
        </form>
        <p className="text-dim" style={{ marginTop: 10 }}>
          Scan a member QR code to check them in. To check out, enter their member ID or member code and select Check Out.
        </p>
        {result && (
          <div className="panel" style={{ background: 'var(--panel-2)', margin: '14px 0 0' }}>
            <strong>{result.action}:</strong> {result.member.full_name} ({result.member.member_code})
          </div>
        )}
        {scannerError && <p className="text-dim">{scannerError}</p>}
        {scannerOpen && <div className="camera-scanner"><div id="qr-reader" /><button className="btn btn-sm btn-danger" onClick={stopScanner}>Stop Camera</button></div>}
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <label style={{ margin: 0 }}>Date:</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn btn-ghost" onClick={() => setDate(todayStr())}>Today</button>
        </div>
        <table>
          <thead><tr><th>Member</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="empty">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={4} className="empty">{error}</td></tr>}
            {!loading && !error && rows.length === 0 && <tr><td colSpan={4} className="empty">No attendance for this date</td></tr>}
            {!loading && !error && rows.map((a, i) => (
              <tr key={i}>
                <td>{a.full_name} <span className="text-dim">({a.member_code})</span></td>
                <td>{fmtTime(a.check_in)}</td>
                <td>{fmtTime(a.check_out)}</td>
                <td>{a.check_out ? <span className="badge badge-inactive">Left</span> : <span className="badge badge-active">In Gym</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
