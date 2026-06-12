import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Card, CardContent } from './ui/card';
import { Flame, Heart, Shield, AlertTriangle, HelpCircle, MapPin, Locate } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import dynamic from 'next/dynamic';

const LocationMap = dynamic(() => import('./LocationMap').then(mod => mod.LocationMap), {
  ssr: false,
  loading: () => <div className="w-full h-[250px] flex items-center justify-center bg-slate-50 text-slate-500 text-sm rounded-lg border border-slate-200">Loading map...</div>
});
import type { EmergencyCategory, EmergencyCategoryConfig } from '../types';

const EMERGENCY_CATEGORIES: EmergencyCategoryConfig[] = [
    {
        id: 'fire',
        label: 'Fire',
        icon: 'flame',
        color: 'text-orange-600',
        bgColor: 'bg-orange-100 hover:bg-orange-200 border-orange-300',
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
        color: 'text-blue-600',
        bgColor: 'bg-blue-100 hover:bg-blue-200 border-blue-300',
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
        color: 'text-gray-600',
        bgColor: 'bg-gray-100 hover:bg-gray-200 border-gray-300',
    },
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
    onSubmit: (report: {
        category: EmergencyCategory;
        description: string;
        reporterName: string;
        contactNumber: string;
        location: string;
        latitude?: number;
        longitude?: number;
    }) => void;
    onCancel: () => void;
    defaultName?: string;
    defaultCategory?: EmergencyCategory | null;
    latitude?: number | null;
    longitude?: number | null;
}

export function EmergencyReportForm({
    onSubmit,
    onCancel,
    defaultName = '',
    defaultCategory = null,
    latitude = null,
    longitude = null,
}: EmergencyReportFormProps) {
    const [selectedCategory, setSelectedCategory] = useState<EmergencyCategory | null>(defaultCategory);
    const [description, setDescription] = useState('');
    const [reporterName, setReporterName] = useState(defaultName);
    const [contactNumber, setContactNumber] = useState('');
    const [location, setLocation] = useState('');
    const [currentLatitude, setCurrentLatitude] = useState<number | null>(latitude);
    const [currentLongitude, setCurrentLongitude] = useState<number | null>(longitude);
    const [errors, setErrors] = useState<Record<string, string>>({});

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
        }
        if (!location.trim()) {
            newErrors.location = 'Please enter the location';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm() || !selectedCategory) return;

        onSubmit({
            category: selectedCategory,
            description: description.trim(),
            reporterName: reporterName.trim(),
            contactNumber: contactNumber.trim(),
            location: location.trim(),
            latitude: currentLatitude ?? undefined,
            longitude: currentLongitude ?? undefined,
        });

        // Reset form
        setSelectedCategory(null);
        setDescription('');
        setReporterName(defaultName);
        setContactNumber('');
        setLocation('');
        setErrors({});
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Emergency Category Selection */}
            <div className="space-y-2">
                <Label>Emergency Category *</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {EMERGENCY_CATEGORIES.map((category) => {
                        const Icon = getIcon(category.icon);
                        const isSelected = selectedCategory === category.id;

                        return (
                            <Card
                                key={category.id}
                                className={`cursor-pointer transition-all border-2 ${isSelected
                                        ? `${category.bgColor} border-current`
                                        : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                onClick={() => setSelectedCategory(category.id)}
                            >
                                <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
                                    <Icon className={`w-8 h-8 ${isSelected ? category.color : 'text-gray-400'}`} />
                                    <span className={`font-medium ${isSelected ? category.color : 'text-gray-700'}`}>
                                        {category.label}
                                    </span>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
                {errors.category && <p className="text-sm text-red-600">{errors.category}</p>}
            </div>

            {/* Description */}
            <div className="space-y-2">
                <Label htmlFor="description">Description of Incident *</Label>
                <Textarea
                    id="description"
                    placeholder="Describe the emergency in detail (what happened, severity, number of people involved, etc.)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className={errors.description ? 'border-red-500' : ''}
                />
                {errors.description && <p className="text-sm text-red-600">{errors.description}</p>}
            </div>

            {/* Reporter Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="reporterName">Reporter Name *</Label>
                    <Input
                        id="reporterName"
                        type="text"
                        placeholder="Your full name"
                        value={reporterName}
                        onChange={(e) => setReporterName(e.target.value)}
                        className={errors.reporterName ? 'border-red-500' : ''}
                    />
                    {errors.reporterName && <p className="text-sm text-red-600">{errors.reporterName}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="contactNumber">Contact Number *</Label>
                    <Input
                        id="contactNumber"
                        type="tel"
                        placeholder="+1 (555) 123-4567"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        className={errors.contactNumber ? 'border-red-500' : ''}
                    />
                    {errors.contactNumber && <p className="text-sm text-red-600">{errors.contactNumber}</p>}
                </div>
            </div>

            {/* Location */}
            <div className="space-y-2">
                <Label htmlFor="location">Exact Location *</Label>
                {currentLatitude && currentLongitude && (
                    <Alert className="mb-2">
                        <Locate className="h-4 w-4" />
                        <AlertDescription>
                            <div className="flex items-center gap-2">
                                <MapPin className="h-3 w-3" />
                                <span className="text-xs">
                                    GPS: {currentLatitude.toFixed(6)}, {currentLongitude.toFixed(6)}
                                </span>
                            </div>
                        </AlertDescription>
                    </Alert>
                )}
                <Input
                    id="location"
                    type="text"
                    placeholder="Street address, building name, landmarks, etc."
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className={errors.location ? 'border-red-500' : ''}
                />
                {errors.location && <p className="text-sm text-red-600">{errors.location}</p>}
                <p className="text-xs text-gray-500">Your GPS coordinates will be automatically included with this report</p>
                {currentLatitude && currentLongitude && (
                    <div className="mt-3">
                        <p className="text-xs font-medium text-gray-700 mb-2">Click on the map to adjust the pin location</p>
                        <LocationMap
                            latitude={currentLatitude}
                            longitude={currentLongitude}
                            onLocationChange={(newLat, newLng) => {
                                setCurrentLatitude(newLat);
                                setCurrentLongitude(newLng);
                            }}
                            interactive={true}
                            height="350px"
                        />
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
                    Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700">
                    Submit Report
                </Button>
            </div>
        </form>
    );
}