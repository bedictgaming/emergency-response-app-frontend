import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from './ui/button';

interface IncidentCameraCaptureProps {
    onCapture: (file: File) => void;
    onClose: () => void;
}

const MAX_CAPTURE_DIMENSION = 1600;
const MAX_CAPTURE_BYTES = 5 * 1024 * 1024;

export function IncidentCameraCapture({ onCapture, onClose }: IncidentCameraCaptureProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const activeRef = useRef(true);
    const [ready, setReady] = useState(false);
    const [capturing, setCapturing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        activeRef.current = true;
        const video = videoRef.current;
        const openCamera = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setError('Camera access is not available in this browser. Choose a photo instead.');
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: { ideal: 'environment' } },
                });
                if (!activeRef.current) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (video) video.srcObject = stream;
            } catch (cameraError) {
                if (!activeRef.current) return;
                streamRef.current?.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
                const name = cameraError instanceof Error ? cameraError.name : '';
                setError(name === 'NotAllowedError' || name === 'PermissionDeniedError'
                    ? 'Camera access was denied. Allow camera access in your browser, or choose a photo instead.'
                    : 'The camera could not start. Check that another app is not using it, or choose a photo instead.');
            }
        };

        void openCamera();
        return () => {
            activeRef.current = false;
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            if (video) video.srcObject = null;
        };
    }, []);

    const takePhoto = () => {
        const video = videoRef.current;
        if (!video || !ready || capturing || !video.videoWidth || !video.videoHeight) return;

        const scale = Math.min(1, MAX_CAPTURE_DIMENSION / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext('2d');
        if (!context) {
            setError('Could not capture the image. Please choose a photo instead.');
            return;
        }

        setCapturing(true);
        try {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (!activeRef.current) return;
                setCapturing(false);
                if (!blob) {
                    setError('Could not capture the image. Please try again or choose a photo.');
                    return;
                }
                if (blob.type !== 'image/jpeg') {
                    setError('This browser could not create a JPEG photo. Please choose a photo instead.');
                    return;
                }
                if (blob.size > MAX_CAPTURE_BYTES) {
                    setError('The captured photo is over 5 MB. Please try again or choose a smaller photo.');
                    return;
                }
                onCapture(new File([blob], `incident-camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
            }, 'image/jpeg', 0.85);
        } catch {
            setCapturing(false);
            setError('Could not capture the image. Please try again or choose a photo.');
        }
    };

    return (
        <div className="space-y-3 rounded-xl border border-border bg-card p-3" role="group" aria-label="Camera preview">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Take a current photo</p>
                <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close camera">
                    <X className="h-4 w-4" aria-hidden="true" />
                </Button>
            </div>
            {!error && (
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    onCanPlay={() => setReady(true)}
                    aria-label="Live camera view"
                    className="aspect-video max-h-56 w-full rounded-lg bg-black object-contain"
                />
            )}
            {error ? (
                <p className="text-sm text-destructive" role="alert">{error}</p>
            ) : (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                    {ready ? 'Frame the incident, then take the picture.' : 'Starting camera…'}
                </p>
            )}
            <Button type="button" onClick={takePhoto} disabled={!ready || capturing || Boolean(error)} className="min-h-11 w-full">
                <Camera className="h-4 w-4" aria-hidden="true" />
                {capturing ? 'Capturing…' : 'Take picture'}
            </Button>
        </div>
    );
}
