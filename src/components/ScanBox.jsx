import React, { useState, useEffect, useRef } from 'react';
import { Camera, CameraOff, Sparkles, RefreshCw, Volume2 } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/library';
import masterData from '../data/item_master.json';

// Simple HTML5 Web Audio synth beep generator
const playScanBeep = (type = 'success') => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'success') {
      // Short high pitched beep
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'warning') {
      // Double medium beep
      osc.frequency.value = 587.33; // D5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else {
      // Low failure buzz
      osc.frequency.value = 220; // A3
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    console.warn('AudioContext not allowed or not supported:', e);
  }
};

export default function ScanBox({ onScanMatch, onScanNotFound, onScanMultiple, isEditing }) {
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle', 'found', 'multiple', 'notfound'
  const [statusMsg, setStatusMsg] = useState('Ready for input');
  
  // Camera Scanning States
  const [cameraActive, setCameraActive] = useState(false);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [cameraError, setCameraError] = useState('');

  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const controlsRef = useRef(null);

  // Keep input focused at all times (except when typing in fields or camera active)
  useEffect(() => {
    if (cameraActive || isEditing) return;
    
    const focusInput = () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };
    
    focusInput();

    // Re-focus after standard click-out
    const handleDocumentClick = (e) => {
      // Don't hijack focus if clicking interactive elements like buttons, inputs, etc.
      const tags = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A', 'OPTION'];
      if (tags.includes(e.target.tagName) || e.target.closest('button')) {
        return;
      }
      focusInput();
    };

    // Global keyboard listener for F2 to force focus
    const handleKeyDown = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        focusInput();
      }
    };

    document.addEventListener('click', handleDocumentClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleDocumentClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cameraActive, isEditing]);

  // Handle manual/USB keyboard scanner submit
  const handleScanSubmit = (barcodeRaw) => {
    const barcode = barcodeRaw.trim();
    if (!barcode) return;

    processBarcode(barcode);
    setInputValue('');
  };

  const processBarcode = (barcode) => {
    // Lookup barcode in our static compiled dictionary
    const matches = masterData[barcode];

    if (!matches || matches.length === 0) {
      setStatus('notfound');
      setStatusMsg(`Barcode ${barcode} not found in Master`);
      playScanBeep('error');
      onScanNotFound(barcode);
    } else if (matches.length === 1) {
      setStatus('found');
      setStatusMsg(`🟢 Barcode matches: ${matches[0].itemName}`);
      playScanBeep('success');
      onScanMatch(matches[0]);
    } else {
      setStatus('multiple');
      setStatusMsg(`🟡 Multiple matches found (${matches.length} items)`);
      playScanBeep('warning');
      onScanMultiple(barcode, matches);
    }
  };

  // Initialize Camera Scan and ZXing Reader
  useEffect(() => {
    if (!cameraActive) {
      stopCamera();
      return;
    }

    const startCameraScan = async () => {
      setCameraError('');
      try {
        const codeReader = new BrowserMultiFormatReader();
        codeReaderRef.current = codeReader;

        // List video input devices
        const videoDevices = await codeReader.listVideoInputDevices();
        setAvailableDevices(videoDevices);

        if (videoDevices.length === 0) {
          throw new Error('No camera devices found.');
        }

        // Pick back camera if available, otherwise first camera
        const backCam = videoDevices.find(device => 
          device.label.toLowerCase().includes('back') || 
          device.label.toLowerCase().includes('rear') || 
          device.label.toLowerCase().includes('environment')
        );
        const deviceId = backCam ? backCam.deviceId : videoDevices[0].deviceId;
        setSelectedDeviceId(deviceId);

        startDecoding(deviceId);
      } catch (err) {
        console.error('Camera access error:', err);
        setCameraError(err.message || 'Failed to initialize camera.');
        setCameraActive(false);
      }
    };

    startCameraScan();

    return () => {
      stopCamera();
    };
  }, [cameraActive]);

  const startDecoding = (deviceId) => {
    if (!codeReaderRef.current || !videoRef.current) return;
    
    // Stop any existing stream first
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }

    codeReaderRef.current.decodeFromVideoDevice(
      deviceId,
      videoRef.current,
      (result, error) => {
        if (result) {
          const scannedText = result.getText();
          console.log('ZXing decoded barcode:', scannedText);
          
          // Process immediately
          processBarcode(scannedText);
          
          // Disable camera after a successful scan to prevent loop scans
          setCameraActive(false);
        }
        // Errors are thrown continuously during search, which is expected by ZXing library
      }
    ).then(controls => {
      controlsRef.current = controls;
    }).catch(err => {
      console.error('decodeFromVideoDevice failed:', err);
      setCameraError('Failed to capture video feed.');
    });
  };

  const handleDeviceChange = (e) => {
    const deviceId = e.target.value;
    setSelectedDeviceId(deviceId);
    startDecoding(deviceId);
  };

  const stopCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
      codeReaderRef.current = null;
    }
  };

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 mb-6 shadow-xl">
      <div className="flex flex-col md:flex-row gap-6 items-stretch">
        
        {/* Left Side: Scan Inputs */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-teal-400" />
                Barcode Scanner Input
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => playScanBeep('success')}
                  title="Test Sound"
                  className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
                <span className="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded font-mono border border-slate-700">
                  Shortcut: F2 Focus
                </span>
              </div>
            </div>

            {/* Focused Scan Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleScanSubmit(inputValue);
              }}
              className="relative mb-4"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Scan or type barcode here (Auto-Focused)..."
                disabled={cameraActive}
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-5 py-4 text-xl font-mono text-teal-400 placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 disabled:bg-slate-900 disabled:text-slate-500 transition-all shadow-inner"
              />
              <button
                type="submit"
                disabled={cameraActive}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-teal-600 hover:bg-teal-500 text-white font-medium px-4 py-2 rounded-lg transition disabled:opacity-40"
              >
                Scan (Enter)
              </button>
            </form>

            {/* Status Banner */}
            <div className="mb-4">
              <div
                className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-300 ${
                  status === 'found'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-emerald-950/20'
                    : status === 'multiple'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-amber-950/20'
                    : status === 'notfound'
                    ? 'bg-red-500/10 border-red-500/30 text-red-300 shadow-red-950/20'
                    : 'bg-slate-900/60 border-slate-750 text-slate-400'
                }`}
              >
                <div
                  className={`h-3.5 w-3.5 rounded-full shrink-0 border shadow-sm ${
                    status === 'found'
                      ? 'bg-emerald-500 border-emerald-400 animate-pulse'
                      : status === 'multiple'
                      ? 'bg-amber-500 border-amber-400 animate-pulse'
                      : status === 'notfound'
                      ? 'bg-red-500 border-red-400'
                      : 'bg-slate-650 border-slate-500'
                  }`}
                />
                <span className="text-sm font-medium tracking-wide font-mono break-all">{statusMsg}</span>
              </div>
            </div>
          </div>

          {/* Toggle Camera Stream */}
          <button
            type="button"
            onClick={() => setCameraActive(!cameraActive)}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border font-medium transition ${
              cameraActive
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 hover:bg-rose-500/30'
                : 'bg-teal-500/10 text-teal-300 border-teal-500/20 hover:bg-teal-500/20 hover:border-teal-500/45'
            }`}
          >
            {cameraActive ? (
              <>
                <CameraOff className="h-5 w-5" />
                Stop Mobile Camera Scanner
              </>
            ) : (
              <>
                <Camera className="h-5 w-5" />
                Use Mobile Camera Scanner
              </>
            )}
          </button>
        </div>

        {/* Right Side: Camera Scan Viewport */}
        {cameraActive && (
          <div className="w-full md:w-80 shrink-0 flex flex-col border border-slate-700 bg-slate-950 rounded-xl overflow-hidden shadow-inner">
            <div className="bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-slate-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Live Camera</span>
              {availableDevices.length > 1 && (
                <select
                  value={selectedDeviceId}
                  onChange={handleDeviceChange}
                  className="bg-slate-800 text-xs border border-slate-700 text-slate-300 rounded px-1.5 py-0.5 focus:outline-none"
                >
                  {availableDevices.map((dev) => (
                    <option key={dev.deviceId} value={dev.deviceId}>
                      {dev.label || `Camera ${dev.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            <div className="relative flex-1 min-h-48 flex items-center justify-center bg-black">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              {/* Scan box crosshair overlay */}
              <div className="absolute inset-0 border-[32px] border-black/40 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-28 border-2 border-teal-500 rounded relative shadow-[0_0_15px_rgba(20,184,166,0.3)]">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-teal-500/70 animate-bounce" />
                </div>
              </div>
            </div>

            {cameraError && (
              <p className="p-3 text-xs bg-red-950 border-t border-red-900 text-red-400">{cameraError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
