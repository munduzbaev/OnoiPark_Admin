import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  QrCode, Camera, CameraOff, Play, User, Car,
  RefreshCw, CheckCircle, AlertCircle, X, ShieldCheck
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../contexts/AppContext';
import { saveOfflineSession, generateOfflineId } from '../lib/offline';
import { FALLBACK_PARKINGS } from '../lib/constants';
import { toast } from 'sonner';

type ScanState = 'idle' | 'scanning' | 'found' | 'starting';

/** Attempt to extract a JWT string from raw QR text */
function extractJWT(raw: string): string | null {
  // Case (a): raw text is itself a JWT (header.payload.signature)
  if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(raw.trim())) {
    return raw.trim();
  }
  // Case (b): JSON wrapper { token: "..." } or { t: "..." }
  try {
    const obj = JSON.parse(raw);
    const candidate = obj?.token || obj?.t;
    if (typeof candidate === 'string' && /^eyJ/.test(candidate)) return candidate;
  } catch { /* not JSON */ }
  return null;
}

/** Decode JWT payload to read plate for display-only purposes */
function decodePlateFromJWT(jwt: string): string {
  try {
    const payloadB64 = jwt.split('.')[1];
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload?.plt || '';
  } catch {
    return '';
  }
}

/** Map API error codes to friendly Russian messages */
function mapErrorCode(code: string | null, fallback: string): string {
  switch (code) {
    case 'already_used': return 'Этот QR-код уже использован';
    case 'expired': return 'Срок действия QR-кода истёк. Попросите водителя обновить код.';
    case 'invalid_token': return 'Недействительный QR-код';
    case 'no_active_booking': return 'Нет активной брони или сессии для этого водителя';
    default: return fallback;
  }
}

/** Load parkings from API, falling back to FALLBACK_PARKINGS on error */
async function fetchParkings(): Promise<any[]> {
  try {
    const data = await api.getParkings();
    return data?.length ? data : FALLBACK_PARKINGS;
  } catch {
    return FALLBACK_PARKINGS;
  }
}

export default function QRScannerPage() {
  const { isOffline } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [cameraError, setCameraError] = useState('');

  // JWT extracted from QR
  const [qrToken, setQrToken] = useState<string | null>(null);
  // Plate decoded from JWT payload for display only — NOT trusted for auth
  const [qrDisplayPlate, setQrDisplayPlate] = useState('');

  const [parkings, setParkings] = useState<any[]>(FALLBACK_PARKINGS);

  const [form, setForm] = useState({ parkingId: '', spotNumber: '' });
  const [submitting, setSubmitting] = useState(false);

  // Manual fallback form (always visible)
  const [manualForm, setManualForm] = useState({
    plateNumber: '',
    driverName: '',
    parkingId: '',
    spotNumber: '',
  });
  const [manualSubmitting, setManualSubmitting] = useState(false);

  useEffect(() => {
    if (isOffline) {
      setParkings(FALLBACK_PARKINGS);
    } else {
      fetchParkings().then(setParkings);
    }
    return () => stopScanning();
  }, [isOffline]);

  // ── Camera / scanning ───────────────────────────────────────────────────────
  const stopScanning = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanState('idle');
  }, []);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    if (code) {
      stopScanning();
      handleQRFound(code.data);
      return;
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, [stopScanning]);

  const startScanning = useCallback(async () => {
    setCameraError('');
    setScanState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanState('scanning');
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch {
      setCameraError('Нет доступа к камере. Разрешите доступ в настройках браузера и попробуйте снова.');
      setScanState('idle');
    }
  }, [scanFrame]);

  // ── QR parsing ──────────────────────────────────────────────────────────────
  const handleQRFound = (raw: string) => {
    const jwt = extractJWT(raw);
    if (!jwt) {
      setScanState('idle');
      toast.error('Неверный формат QR-кода. Используйте мобильное приложение OnoiPark.');
      return;
    }
    const plate = decodePlateFromJWT(jwt);
    setQrToken(jwt);
    setQrDisplayPlate(plate);
    setScanState('found');
    toast.success(plate ? `QR отсканирован: ${plate}` : 'QR-код распознан');
  };

  const resetScan = () => {
    setQrToken(null);
    setQrDisplayPlate('');
    setForm({ parkingId: '', spotNumber: '' });
    setScanState('idle');
  };

  // ── Validate QR via API ─────────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!qrToken) return;
    if (!form.parkingId) {
      toast.error('Выберите парковку');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.validateQR({
        token: qrToken,
        parkingId: form.parkingId,
        spotNumber: form.spotNumber ? parseInt(form.spotNumber) : undefined,
      });
      if (result.action === 'entry') {
        toast.success('Въезд разрешён');
      } else if (result.action === 'exit') {
        toast.success(`Выезд разрешён. Стоимость: ${result.cost ?? 0} сом`);
      } else {
        toast.success(result.message || 'Готово');
      }
      resetScan();
    } catch (e: any) {
      toast.error(mapErrorCode(e.code, e.message || 'Ошибка валидации QR'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Manual start (always available) ─────────────────────────────────────────
  const handleManualStart = async () => {
    if (!manualForm.plateNumber || !manualForm.parkingId || !manualForm.spotNumber) {
      toast.error('Заполните обязательные поля');
      return;
    }
    setManualSubmitting(true);
    const parking = parkings.find(p => p.id === manualForm.parkingId);
    try {
      if (isOffline) {
        saveOfflineSession({
          id: generateOfflineId(),
          plateNumber: manualForm.plateNumber.toUpperCase(),
          name: manualForm.driverName || undefined,
          parkingId: manualForm.parkingId,
          parkingName: parking?.name || manualForm.parkingId,
          spotNumber: parseInt(manualForm.spotNumber),
          startTime: new Date().toISOString(),
          pricePerHour: parking?.pricePerHour || 0,
          status: 'active',
        });
        toast.success('Сессия сохранена в офлайн-хранилище!');
      } else {
        await api.manualStart({
          plate_number: manualForm.plateNumber.toUpperCase(),
          parking_id: manualForm.parkingId,
          spot_number: parseInt(manualForm.spotNumber) || undefined,
        });
        toast.success('Сессия начата!');
      }
      setManualForm({ plateNumber: '', driverName: '', parkingId: '', spotNumber: '' });
    } catch (e: any) {
      toast.error('Ошибка: ' + e.message);
    } finally {
      setManualSubmitting(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-400";
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">QR-Сканер</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
          Сканирование QR-кодов водителей
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Camera card ──────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-emerald-500" />
            Сканирование
          </h2>

          <div className="relative bg-slate-900 rounded-xl overflow-hidden mb-4" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />

            {/* Scanning overlay */}
            {scanState === 'scanning' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-48 h-48">
                  <div className="absolute inset-0 border-2 border-emerald-500 rounded-xl opacity-80" />
                  {[
                    'top-0 left-0 border-t-2 border-l-2 rounded-tl-xl',
                    'top-0 right-0 border-t-2 border-r-2 rounded-tr-xl',
                    'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl',
                    'bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl',
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-8 h-8 border-emerald-400 ${cls}`} />
                  ))}
                  <div className="absolute inset-x-0 top-1/2 h-0.5 bg-emerald-500/60 animate-pulse" />
                </div>
                <p className="absolute bottom-4 text-emerald-400 text-sm font-medium animate-pulse">
                  Наведите камеру на QR-код
                </p>
              </div>
            )}

            {/* Idle overlay */}
            {(scanState === 'idle' || scanState === 'starting') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80">
                {scanState === 'starting'
                  ? <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin mb-3" />
                  : <CameraOff className="w-10 h-10 text-slate-500 mb-3" />
                }
                <p className="text-slate-400 text-sm mb-4">
                  {scanState === 'starting' ? 'Запуск камеры...' : 'Камера не активна'}
                </p>
                {scanState === 'idle' && (
                  <button
                    onClick={startScanning}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-all"
                  >
                    <Camera className="w-4 h-4" />
                    Включить камеру
                  </button>
                )}
              </div>
            )}

            {/* Success overlay */}
            {scanState === 'found' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80">
                <CheckCircle className="w-12 h-12 text-emerald-500 mb-2" />
                <p className="text-emerald-400 font-medium text-sm">QR-код распознан!</p>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-red-400 text-sm">{cameraError}</p>
            </div>
          )}

          <div className="flex gap-3">
            {scanState === 'scanning' ? (
              <button onClick={stopScanning}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all">
                Остановить
              </button>
            ) : scanState === 'found' ? (
              <button onClick={resetScan}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all">
                Сканировать снова
              </button>
            ) : (
              <button onClick={startScanning} disabled={scanState === 'starting'}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-all">
                <Play className="w-4 h-4" />
                {scanState === 'starting' ? 'Запуск...' : 'Начать сканирование'}
              </button>
            )}
          </div>
        </div>

        {/* ── Validate form ─────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-500" />
            {scanState === 'found' ? 'Подтверждение въезда/выезда' : 'Ожидание сканирования'}
          </h2>

          {scanState !== 'found' ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <QrCode className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">Отсканируйте QR-код водителя</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">или используйте ручной ввод ниже</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* JWT info (display only) */}
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    {qrDisplayPlate ? (
                      <p className="font-mono text-emerald-500 text-base font-bold">{qrDisplayPlate}</p>
                    ) : (
                      <p className="text-slate-500 dark:text-slate-400 text-sm">Госномер из JWT</p>
                    )}
                    <p className="text-xs text-slate-400 truncate">JWT: {qrToken?.slice(0, 32)}…</p>
                  </div>
                  <button onClick={resetScan} className="ml-auto text-slate-400 hover:text-slate-600 flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-amber-500 mt-2">
                  Госномер отображается только для справки — решение принимает сервер.
                </p>
              </div>

              {/* Validate form */}
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Парковка *</label>
                  <select className={inputCls} value={form.parkingId}
                    onChange={e => setForm(f => ({ ...f, parkingId: e.target.value }))}>
                    <option value="">Выберите парковку</option>
                    {parkings.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Место № (необязательно)</label>
                  <input type="number" className={inputCls} value={form.spotNumber}
                    onChange={e => setForm(f => ({ ...f, spotNumber: e.target.value }))}
                    placeholder="Авто" min="1" />
                </div>
              </div>

              <button onClick={handleValidate} disabled={submitting}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                {submitting ? 'Проверка...' : 'Подтвердить'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Manual entry fallback — ALWAYS visible ────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Car className="w-5 h-5 text-violet-500" />
          Ручной ввод (без QR)
          {isOffline && (
            <span className="ml-auto text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded-full border border-yellow-500/20">
              Офлайн
            </span>
          )}
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>Госномер *</label>
            <input className={inputCls} value={manualForm.plateNumber}
              onChange={e => setManualForm(f => ({ ...f, plateNumber: e.target.value }))}
              placeholder="А123ВС" />
          </div>
          <div>
            <label className={labelCls}>Имя водителя</label>
            <input className={inputCls} value={manualForm.driverName}
              onChange={e => setManualForm(f => ({ ...f, driverName: e.target.value }))}
              placeholder="Необязательно" />
          </div>
          <div>
            <label className={labelCls}>Парковка *</label>
            <select className={inputCls} value={manualForm.parkingId}
              onChange={e => setManualForm(f => ({ ...f, parkingId: e.target.value }))}>
              <option value="">Выберите</option>
              {parkings.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Место № *</label>
            <input type="number" className={inputCls} value={manualForm.spotNumber}
              onChange={e => setManualForm(f => ({ ...f, spotNumber: e.target.value }))}
              placeholder="1" min="1" />
          </div>
        </div>
        <button onClick={handleManualStart} disabled={manualSubmitting}
          className="mt-4 flex items-center gap-2 px-6 py-2.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-medium rounded-lg transition-all text-sm">
          {manualSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {manualSubmitting ? 'Запуск...' : 'Начать сессию вручную'}
        </button>
      </div>
    </div>
  );
}
