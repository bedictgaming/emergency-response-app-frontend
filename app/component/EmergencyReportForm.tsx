import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";
/* eslint-disable @next/next/no-img-element -- local proof preview uses an object URL */
import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Flame, Heart, Shield, AlertTriangle, HelpCircle, MapPin, Locate, Camera, X, ImageIcon, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { isWithinCordovaMapBounds } from '../lib/cordovaBoundary';
import { isReportGpsFresh, useReportGps } from '../hooks/useReportGps';
import { IncidentCameraCapture } from './IncidentCameraCapture';

const LocationMap = dynamic(() => import('./LocationMap').then(mod => mod.LocationMap), {
  ssr: false,
  loading: () => <LoadingPlaceholder label="Loading Cordova map..." layout="map" className="h-[240px]" />
});
import type { EmergencyCategory, EmergencyCategoryConfig, ResponseService } from '../types';
const BARANGAYS = ['Alegria', 'Bangbang', 'Buagsong', 'Catarman', 'Cogon', 'Dapitan', 'Day-as', 'Gabi', 'Gilutongan', 'Ibabao', 'Pilipog', 'Poblacion', 'San Miguel'];

const canonicalBarangay = (...values: unknown[]) => {
    const candidates = values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase());
    return BARANGAYS.find((name) => {
        const normalized = name.toLowerCase();
        return candidates.some((candidate) => candidate === normalized || candidate.includes(normalized));
    });
};

const EMERGENCY_CATEGORIES: EmergencyCategoryConfig[] = [
    {
        id: 'fire',
        label: 'Fire',
        icon: 'flame',
        color: 'text-red-600',
        bgColor: 'bg-red-50 hover:bg-red-100 border-red-200',
    },
    {
        id: 'medical',
        label: 'Medical',
        icon: 'heart',
        color: 'text-red-600',
        bgColor: 'bg-red-100 hover:bg-red-200 border-red-300',
    },
    {
        id: 'police',
        label: 'Police',
        icon: 'shield',
        color: 'text-slate-800',
        bgColor: 'bg-slate-100 hover:bg-slate-200 border-slate-300',
    },
    {
        id: 'hazard',
        label: 'Hazard',
        icon: 'alert-triangle',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100 hover:bg-yellow-200 border-yellow-300',
    },
    {
        id: 'other',
        label: 'Other',
        icon: 'help-circle',
        color: 'text-slate-700',
        bgColor: 'bg-slate-100 hover:bg-slate-200 border-slate-300',
    },
];

const CATEGORY_STYLES: Record<EmergencyCategory, { selectedBg: string; selectedText: string; selectedIcon: string }> = {
    fire: {
        selectedBg: 'bg-red-50 border border-red-500',
        selectedText: 'text-red-800',
        selectedIcon: 'text-red-600',
    },
    medical: {
        selectedBg: 'bg-red-50 border border-red-500',
        selectedText: 'text-red-800',
        selectedIcon: 'text-red-500',
    },
    police: {
        selectedBg: 'bg-slate-100 border border-slate-700',
        selectedText: 'text-slate-900',
        selectedIcon: 'text-slate-800',
    },
    hazard: {
        selectedBg: 'bg-amber-50 border border-amber-500',
        selectedText: 'text-amber-800',
        selectedIcon: 'text-amber-500',
    },
    other: {
        selectedBg: 'bg-slate-100 border border-slate-700',
        selectedText: 'text-slate-800',
        selectedIcon: 'text-slate-600',
    },
};

const RESPONSE_SERVICES: Array<{ id: ResponseService; label: string; description: string }> = [
    { id: 'FIRE', label: 'Fire / BFP', description: 'Fire engines and fire responders' },
    { id: 'MEDICAL', label: 'Medical / EMS', description: 'Ambulance and medical responders' },
    { id: 'POLICE', label: 'Police / PNP', description: 'Police and security responders' },
    { id: 'HAZARD', label: 'Hazard / DRRMO', description: 'Rescue and disaster responders' },
];

const getIcon = (iconName: string) => {
    switch (iconName) {
        case 'flame':
            return Flame;
        case 'heart':
            return Heart;
        case 'shield':
            return Shield;
        case 'alert-triangle':
            return AlertTriangle;
        case 'help-circle':
            return HelpCircle;
        default:
            return HelpCircle;
    }
};

interface EmergencyReportFormProps {
    submitting?: boolean;
    onSubmit: (report: {
        category: EmergencyCategory;
        requestedServices?: ResponseService[];
        description: string;
        reporterName: string;
        contactNumber: string;
        location: string;
        barangayName: string;
        latitude?: number;
        longitude?: number;
        photoFile?: File | null;
    }) => void;
    onCancel: () => void;
    defaultName?: string;
    defaultCategory?: EmergencyCategory | null;
}

export function EmergencyReportForm({
    submitting = false,
    onSubmit,
    onCancel,
    defaultName = '',
    defaultCategory = null,
}: EmergencyReportFormProps) {
    const [selectedCategory, setSelectedCategory] = useState<EmergencyCategory | null>(defaultCategory);
    const [requestedServices, setRequestedServices] = useState<ResponseService[]>([]);
    const [description, setDescription] = useState('');
    const [reporterName, setReporterName] = useState(defaultName);
    const [contactNumber, setContactNumber] = useState('');
    const [location, setLocation] = useState('');
    const [barangayName, setBarangayName] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);
    const geocodeAbortRef = useRef<AbortController | null>(null);
    const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const geocodeRequestRef = useRef(0);
    const geocodeCacheRef = useRef(new Map<string, { address: string; barangay?: string }>());
    const addressEditedRef = useRef(false);
    const barangayEditedRef = useRef(false);
    const { fix: gpsFix, loading: gpsLoading, error: gpsError, preliminary, refresh: refreshGps } = useReportGps();
    const currentLatitude = gpsFix?.latitude ?? null;
    const currentLongitude = gpsFix?.longitude ?? null;
    const isGpsInCordova = gpsFix !== null && isWithinCordovaMapBounds(gpsFix.latitude, gpsFix.longitude);
    const [confirmedFix, setConfirmedFix] = useState<typeof gpsFix>(null);
    const locationConfirmed = gpsFix !== null && confirmedFix === gpsFix;
    const [errors, setErrors] = useState<Record<string, string>>({});

    // The dashboard can open the one-tap form while the verified profile is
    // still loading. Populate the reporter name as soon as that profile
    // arrives without overwriting anything the citizen already typed.
    useEffect(() => {
        if (!defaultName) return;
        setReporterName((current) => current.trim() ? current : defaultName);
    }, [defaultName]);

    // Reverse geocode coordinates to human-readable address within Cordova
    const reverseGeocode = (lat: number, lng: number) => {
        if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
        geocodeAbortRef.current?.abort();
        const requestId = ++geocodeRequestRef.current;
        const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        const cached = geocodeCacheRef.current.get(key);
        if (cached) {
            if (!addressEditedRef.current) setLocation(cached.address);
            if (cached.barangay && !barangayEditedRef.current) setBarangayName(cached.barangay);
            setIsGeocoding(false);
            return;
        }
        setIsGeocoding(true);
        // Avoid sending a request for every drag/tap and bound public-provider
        // latency. The exact pin remains usable even when address lookup fails.
        geocodeTimerRef.current = setTimeout(async () => {
            const controller = new AbortController();
            geocodeAbortRef.current = controller;
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
                {
                    signal: controller.signal,
                    headers: {
                        'Accept-Language': 'en',
                    },
                }
            );

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (requestId !== geocodeRequestRef.current) return;
            const addr = data.address || {};

            const roadOrPlace = addr.amenity || addr.building || addr.shop || addr.tourism || addr.road || addr.pedestrian || addr.footway;
            const barangay = addr.suburb || addr.village || addr.neighbourhood || addr.quarter || addr.hamlet;
            const town = addr.town || addr.municipality || addr.city;
            const province = addr.province || addr.state;

            const parts = [roadOrPlace, barangay, town, province].filter(Boolean);
            const formattedAddress = (roadOrPlace || barangay) && parts.length > 0
                ? parts.join(', ')
                : `Pinned location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;

            if (!addressEditedRef.current) setLocation(formattedAddress);
            const detectedBarangay = canonicalBarangay(
                barangay,
                addr.suburb,
                addr.village,
                addr.neighbourhood,
                addr.quarter,
                addr.hamlet,
                data.display_name,
            );
            geocodeCacheRef.current.set(key, { address: formattedAddress, barangay: detectedBarangay });
            if (detectedBarangay && !barangayEditedRef.current) {
                setBarangayName(detectedBarangay);
                setErrors((prev) => {
                    if (!prev.barangayName) return prev;
                    const next = { ...prev };
                    delete next.barangayName;
                    return next;
                });
            }
            if (!addressEditedRef.current) setErrors((prev) => {
                if (!prev.location) return prev;
                const next = { ...prev };
                delete next.location;
                return next;
            });
            } catch (err: unknown) {
                if (requestId !== geocodeRequestRef.current) return;
                if (!(err instanceof Error && err.name === 'AbortError')) {
                    // Address lookup is optional; the citizen can supply a landmark.
                    setLocation((prev) => prev.trim() || addressEditedRef.current ? prev : `Pinned location (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
                }
            } finally {
                clearTimeout(timeout);
                if (requestId === geocodeRequestRef.current) setIsGeocoding(false);
            }
        }, 1100);
    };

    useEffect(() => {
        if (gpsFix && isGpsInCordova) {
            if (!addressEditedRef.current) setLocation(`Pinned location (${gpsFix.latitude.toFixed(6)}, ${gpsFix.longitude.toFixed(6)})`);
            if (!barangayEditedRef.current) setBarangayName('');
            reverseGeocode(gpsFix.latitude, gpsFix.longitude);
        } else {
            setIsGeocoding(false);
        }
        return () => {
            geocodeRequestRef.current += 1;
            if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
            geocodeAbortRef.current?.abort();
        };
    // A fresh snapshot may offer address hints, never overwrite edited text.
    }, [gpsFix, isGpsInCordova]);

    // Photo evidence state
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string>('');
    const [isDragging, setIsDragging] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const MAX_SIZE_MB = 5;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

    const handlePhotoSelect = (file: File) => {
        setPhotoError('');
        if (!ALLOWED_TYPES.includes(file.type)) {
            setPhotoError(`Invalid file type. Only JPEG, PNG, and WEBP images are accepted.`);
            return;
        }
        if (file.size > MAX_SIZE_BYTES) {
            setPhotoError(`Photo is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max allowed: ${MAX_SIZE_MB}MB.`);
            return;
        }
        setPhotoFile(file);
        setCameraOpen(false);
        const reader = new FileReader();
        reader.onload = (e) => setPhotoPreview(e.target?.result as string);
        reader.readAsDataURL(file);
    };

    const handlePhotoDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handlePhotoSelect(file);
    };

    const handlePhotoRemove = () => {
        setPhotoFile(null);
        setPhotoPreview(null);
        setPhotoError('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const updateContactNumber = (value: string) => {
        setContactNumber(value);
        if (/^[0-9]{1,11}$/.test(value)) {
            setErrors((current) => {
                if (!current.contactNumber) return current;
                const next = { ...current };
                delete next.contactNumber;
                return next;
            });
        }
    };

    const handleContactPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
        event.preventDefault();
        const input = event.currentTarget;
        const start = input.selectionStart ?? contactNumber.length;
        const end = input.selectionEnd ?? start;
        const remaining = 11 - (contactNumber.length - (end - start));
        // Clean before applying the limit: spaces in a pasted number must not
        // consume its digit allowance or remove the existing unselected suffix.
        const pastedDigits = event.clipboardData.getData('text').replace(/[^0-9]/g, '');
        if (!pastedDigits) return;
        const digits = pastedDigits.slice(0, remaining);
        updateContactNumber(contactNumber.slice(0, start) + digits + contactNumber.slice(end));
    };

    const validateForm = () => {
        const newErrors: Record<string, string> = {};

        if (!selectedCategory) {
            newErrors.category = 'Please select an emergency category';
        }
        if (!description.trim()) {
            newErrors.description = 'Please describe the emergency';
        }
        if (!reporterName.trim()) {
            newErrors.reporterName = 'Please enter your name';
        }
        if (!contactNumber.trim()) {
            newErrors.contactNumber = 'Please enter your contact number';
        } else if (!/^[0-9]{1,11}$/.test(contactNumber)) {
            newErrors.contactNumber = 'Use numbers only, up to 11 digits';
        }
        if (!location.trim()) {
            newErrors.location = 'Please enter the location';
        }
        if (selectedCategory === 'other' && requestedServices.length < 2) {
            newErrors.requestedServices = 'Select at least two response services needed for this emergency';
        }
        if (!barangayName) newErrors.barangayName = 'Select the incident barangay';
        if (!locationConfirmed || !isReportGpsFresh(gpsFix)) {
            newErrors.location = 'Get a fresh GPS fix and confirm that the emergency is at your location.';
        }
        if (!photoFile) {
            newErrors.photo = 'A current proof photo is required to submit a citizen report';
            setPhotoError(newErrors.photo);
        }
        if (currentLatitude !== null && currentLongitude !== null && !isWithinCordovaMapBounds(currentLatitude, currentLongitude)) {
            newErrors.location = 'Your GPS location is outside the Cordova map area. This form cannot move the pin; call 911 for help.';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (submitting || !validateForm() || !selectedCategory) return;

        onSubmit({
            category: selectedCategory,
            requestedServices: selectedCategory === 'other' ? requestedServices : undefined,
            description: description.trim(),
            reporterName: reporterName.trim(),
            contactNumber: contactNumber.trim(),
            location: location.trim(),
            barangayName,
            latitude: currentLatitude ?? undefined,
            longitude: currentLongitude ?? undefined,
            photoFile: photoFile,
        });

        // Keep the draft and photo on failure. The parent closes the form only on success.
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <fieldset disabled={submitting} className="space-y-4" aria-busy={submitting}>
            {/* Emergency Category Selection */}
            <div className="space-y-2">
                <span id="emergency-category-label" className="text-sm font-semibold text-slate-900">Emergency Category *</span>
                <div className="grid grid-cols-3 gap-3" role="group" aria-labelledby="emergency-category-label" aria-describedby={errors.category ? 'emergency-category-error' : undefined}>
                    {EMERGENCY_CATEGORIES.map((category) => {
                        const Icon = getIcon(category.icon);
                        const isSelected = selectedCategory === category.id;
                        const style = CATEGORY_STYLES[category.id];

                        return (
                            <button
                                key={category.id}
                                type="button"
                                aria-pressed={isSelected}
                                className={`motion-press group flex min-h-[82px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 ${
                                    isSelected
                                        ? style.selectedBg
                                        : 'border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                                }`}
                                onClick={() => {
                                    setSelectedCategory(category.id);
                                    if (category.id !== 'other') setRequestedServices([]);
                                }}
                            >
                                <Icon className={`h-6 w-6 stroke-[1.75] ${isSelected ? style.selectedIcon : 'text-slate-500'}`} />
                                <span className={`text-xs font-medium sm:text-sm ${isSelected ? style.selectedText : 'text-slate-700'}`}>
                                    {category.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {errors.category && <p id="emergency-category-error" role="alert" className="text-xs text-red-600">{errors.category}</p>}
            </div>

            {selectedCategory === 'other' && (
                <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div>
                        <span id="response-services-label" className="text-xs font-semibold text-slate-900">Response services needed *</span>
                        <p className="mt-0.5 text-[11px] text-slate-600">
                            Select at least two departments. The same report will alert every selected service.
                        </p>
                    </div>
                    <div role="group" aria-labelledby="response-services-label" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {RESPONSE_SERVICES.map((service) => {
                            const checked = requestedServices.includes(service.id);
                            return (
                                <label
                                    key={service.id}
                                    className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${checked ? 'border-red-500 bg-white' : 'border-slate-200 bg-white hover:border-slate-400'}`}
                                >
                                    <input
                                        type="checkbox"
                                        aria-label={`${service.label} response`}
                                        checked={checked}
                                        onChange={() => {
                                            setRequestedServices((current) => checked
                                                ? current.filter((item) => item !== service.id)
                                                : [...current, service.id]);
                                            setErrors((current) => {
                                                if (!current.requestedServices) return current;
                                                const next = { ...current };
                                                delete next.requestedServices;
                                                return next;
                                            });
                                        }}
                                        className="mt-0.5 h-4 w-4 accent-red-600"
                                    />
                                    <span>
                                        <span className="block text-xs font-semibold text-slate-900">{service.label}</span>
                                        <span className="block text-[11px] text-slate-500">{service.description}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                    {errors.requestedServices && <p className="text-xs text-red-600">{errors.requestedServices}</p>}
                </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
                <Label htmlFor="description" className="text-sm font-semibold text-slate-900">Description of Incident *</Label>
                <Textarea
                    id="description"
                    placeholder="Describe the emergency in detail (what happened, severity, number of people involved, etc.)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className={`h-[72px] min-h-[72px] resize-none rounded-xl border bg-slate-50 px-3.5 py-2.5 text-sm placeholder:text-slate-400 transition-all focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-300 ${errors.description ? 'border-red-500' : 'border-slate-200'}`}
                />
                {errors.description && <p className="text-xs text-red-600">{errors.description}</p>}
            </div>

            {/* Reporter Information */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="reporterName" className="text-sm font-semibold text-slate-900">Reporter Name *</Label>
                    <Input
                        id="reporterName"
                        type="text"
                        placeholder="Your full name"
                        value={reporterName}
                        onChange={(e) => setReporterName(e.target.value)}
                        className={`h-10 rounded-xl bg-slate-50 px-3.5 text-sm focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-300 ${errors.reporterName ? 'border-red-500' : 'border-slate-200'}`}
                    />
                    {errors.reporterName && <p className="text-xs text-red-600">{errors.reporterName}</p>}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="contactNumber" className="text-sm font-semibold text-slate-900">Contact Number *</Label>
                    <Input
                        id="contactNumber"
                        name="contactNumber"
                        type="tel"
                        inputMode="numeric"
                        maxLength={11}
                        pattern="[0-9]{1,11}"
                        placeholder="09171234567"
                        autoComplete="tel"
                        value={contactNumber}
                        onChange={(e) => updateContactNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
                        onPaste={handleContactPaste}
                        aria-invalid={Boolean(errors.contactNumber)}
                        aria-describedby={`contact-number-hint${errors.contactNumber ? ' contact-number-error' : ''}`}
                        className={`h-10 rounded-xl bg-slate-50 px-3.5 text-base! lg:text-sm! focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-red-600 ${errors.contactNumber ? 'border-red-500' : 'border-slate-200'}`}
                    />
                    <p id="contact-number-hint" className="text-sm text-muted-foreground">Numbers only, up to 11 digits.</p>
                    {errors.contactNumber && <p id="contact-number-error" className="text-sm text-red-600">{errors.contactNumber}</p>}
                </div>
            </div>

            {/* Location */}
            <div className="space-y-1.5">
                <Label htmlFor="incident-barangay" className="text-sm font-semibold text-slate-900">Incident barangay *</Label>
                <select
                    id="incident-barangay"
                    value={barangayName}
                    onChange={(event) => {
                        barangayEditedRef.current = true;
                        setBarangayName(event.target.value);
                    }}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-indigo-300"
                >
                    <option value="">Choose the incident barangay</option>
                    {BARANGAYS.map((name) => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>
                {errors.barangayName && <p role="alert" className="text-xs text-red-600">{errors.barangayName}</p>}
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="location" className="text-sm font-semibold text-slate-900">Exact Location *</Label>
                    {isGeocoding ? (
                        <span className="text-xs text-blue-600 font-medium flex items-center gap-1.5 animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                            Detecting address...
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                if (currentLatitude === null || currentLongitude === null || !locationConfirmed) {
                                    setErrors((prev) => ({
                                        ...prev,
                                        location: 'Confirm your GPS location first.',
                                    }));
                                    return;
                                }
                                addressEditedRef.current = false;
                                reverseGeocode(currentLatitude, currentLongitude);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 hover:underline cursor-pointer transition-colors"
                            title="Auto-fill address from current pin location"
                        >
                            <MapPin className="w-3.5 h-3.5 text-blue-500" />
                            Auto-fill from pin
                        </button>
                    )}
                </div>

                {currentLatitude !== null && currentLongitude !== null && (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                        <Locate className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        <span className="font-mono">
                            GPS: {currentLatitude.toFixed(6)}, {currentLongitude.toFixed(6)}
                        </span>
                    </div>
                )}

                <div className="relative">
                    <Input
                        id="location"
                        type="text"
                        placeholder="Street address, building name, landmarks, etc."
                        value={location}
                        onChange={(e) => {
                            addressEditedRef.current = true;
                            setLocation(e.target.value);
                        }}
                        className={`h-10 rounded-xl bg-slate-50 px-3.5 text-sm focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-red-600 ${errors.location ? 'border-red-500' : 'border-slate-200'} ${isGeocoding ? 'pr-9' : ''}`}
                    />
                    {isGeocoding && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                        </div>
                    )}
                </div>
                {errors.location && <p className="text-xs text-red-600">{errors.location}</p>}
                <p className="text-[11px] text-slate-500">
                    Address lookup is approximate; add a street, building, or landmark. Editing this text does not move the GPS pin.
                </p>

                <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">GPS incident location</p>
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            Pin locked to GPS
                        </span>
                    </div>
                    {gpsFix && isGpsInCordova && (
                        <LocationMap latitude={currentLatitude} longitude={currentLongitude} interactive={false} height="240px" />
                    )}
                    <p className="text-base sm:text-sm text-muted-foreground">
                        Report only an emergency at your current location. You cannot move this pin. If GPS is wrong or the emergency is elsewhere, <a href="tel:911" className="font-semibold underline underline-offset-4">call 911</a>.
                    </p>
                    <div role="status" className="text-base sm:text-sm text-foreground">
                        {gpsLoading ? preliminary ? 'A preliminary estimate is available. Waiting for a fresh GPS fix before confirmation…' : 'Getting a fresh GPS location…' : gpsError ? gpsError : !isGpsInCordova
                            ? 'Your GPS location is outside the Cordova map area. Retry GPS or call 911.'
                            : `Device estimate: accurate to about ${Math.max(1, Math.round(gpsFix?.accuracy ?? 0))} m. Check the pin before confirming.`}
                        {locationConfirmed && <p className="mt-1 font-semibold text-green-700">Location confirmed</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                        <Button type="button" disabled={gpsLoading || !isGpsInCordova || locationConfirmed}
                            onClick={() => {
                                if (!isReportGpsFresh(gpsFix)) { refreshGps(); return; }
                                setConfirmedFix(gpsFix);
                                setErrors(previous => {
                                    const next = { ...previous };
                                    delete next.location;
                                    return next;
                                });
                            }} className="min-h-11">
                            Confirm GPS location
                        </Button>
                        <Button type="button" variant="outline" disabled={gpsLoading} onClick={refreshGps} className="min-h-11">
                            Refresh GPS
                        </Button>
                    </div>
                </div>
            </div>

            {/* Photo Evidence Upload */}
            <div className="space-y-2">
                <Label htmlFor="incident-photo" className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <Camera className="h-4 w-4 text-red-600" />
                    Photo Evidence
                    <span className="text-xs font-normal text-slate-500">(Required)</span>
                </Label>

                <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-700" />
                    <p className="text-xs text-slate-700">
                        <strong>A current proof photo is required.</strong> Securely verified before your report is accepted.
                    </p>
                </div>

                {!photoPreview && !cameraOpen && (
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handlePhotoDrop}
                        className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-5 px-4 transition-all duration-200
                            ${ isDragging
                                ? 'border-red-500 bg-red-50'
                                : 'border-slate-300 bg-slate-50 hover:border-slate-500'
                            }`}
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
                            <ImageIcon className="h-5 w-5 text-white" />
                        </div>
                        <div className="text-center">
                            <p className="text-xs font-semibold text-slate-700">Add a current photo of the incident</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">JPEG, PNG, WEBP · Max 5MB</p>
                        </div>
                    </div>
                )}
                {!photoPreview && cameraOpen && (
                    <IncidentCameraCapture
                        onCapture={handlePhotoSelect}
                        onClose={() => setCameraOpen(false)}
                    />
                )}
                {!photoPreview && (
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            aria-describedby={photoError ? 'incident-photo-error' : 'incident-photo-help'}
                            className="min-h-11 flex-1 rounded-xl"
                        >
                            <ImageIcon className="h-4 w-4" aria-hidden="true" />
                            Choose photo
                        </Button>
                        {!cameraOpen && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => { setPhotoError(''); setCameraOpen(true); }}
                                className="min-h-11 flex-1 rounded-xl"
                            >
                                <Camera className="h-4 w-4" aria-hidden="true" />
                                Use camera
                            </Button>
                        )}
                    </div>
                )}
                <span id="incident-photo-help" className="sr-only">A current JPEG, PNG, or WEBP photo up to 5 megabytes is required.</span>
                <input
                    ref={fileInputRef}
                    id="incident-photo"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    aria-required="true"
                    aria-describedby={photoError ? 'incident-photo-error' : 'incident-photo-help'}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoSelect(file);
                    }}
                />
                {photoPreview && (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                        <img
                            src={photoPreview}
                            alt="Incident evidence preview"
                            className="w-full max-h-48 object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                        <div className="absolute bottom-2 left-3 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <span className="text-xs text-white font-medium">{photoFile?.name} ({(photoFile!.size / 1024).toFixed(0)}KB)</span>
                        </div>
                        <button
                            type="button"
                            onClick={handlePhotoRemove}
                            aria-label="Remove selected photo"
                            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg bg-black/70 text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                        >
                            <X className="w-4 h-4 text-white" />
                        </button>
                    </div>
                )}

                {photoError && (
                    <div id="incident-photo-error" role="alert" className="flex items-center gap-1.5 text-red-600">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p className="text-xs">{photoError}</p>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onCancel} className="min-h-11 flex-1 rounded-lg border-slate-300 bg-white font-semibold text-slate-800 shadow-none hover:bg-slate-50">
                    Cancel
                </Button>
                <Button type="submit" className="min-h-11 flex-1 rounded-lg border-0 bg-red-600 font-semibold text-white shadow-sm hover:bg-red-700">
                    Submit Report
                </Button>
            </div>
            </fieldset>
        </form>
    );
}
