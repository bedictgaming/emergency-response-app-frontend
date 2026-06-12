import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Flame, Heart, Shield, AlertTriangle, HelpCircle, MapPin, Phone, User, Clock } from 'lucide-react';
import dynamic from 'next/dynamic';

const LocationMap = dynamic(() => import('./LocationMap').then(mod => mod.LocationMap), {
  ssr: false,
  loading: () => <div className="w-full h-full min-h-[200px] flex items-center justify-center bg-slate-50 text-slate-500 text-sm rounded-lg border border-slate-200">Loading map...</div>
});
import type { EmergencyReport } from '../types';

const getCategoryConfig = (category: EmergencyReport['category']) => {
    switch (category) {
        case 'fire':
            return {
                label: 'Fire',
                icon: Flame,
                color: 'text-orange-600',
                bgColor: 'bg-orange-100',
                borderColor: 'border-orange-300',
            };
        case 'medical':
            return {
                label: 'Medical',
                icon: Heart,
                color: 'text-red-600',
                bgColor: 'bg-red-100',
                borderColor: 'border-red-300',
            };
        case 'police':
            return {
                label: 'Police',
                icon: Shield,
                color: 'text-blue-600',
                bgColor: 'bg-blue-100',
                borderColor: 'border-blue-300',
            };
        case 'hazard':
            return {
                label: 'Hazard',
                icon: AlertTriangle,
                color: 'text-yellow-600',
                bgColor: 'bg-yellow-100',
                borderColor: 'border-yellow-300',
            };
        default:
            return {
                label: 'Other',
                icon: HelpCircle,
                color: 'text-gray-600',
                bgColor: 'bg-gray-100',
                borderColor: 'border-gray-300',
            };
    }
};

const getStatusConfig = (status: EmergencyReport['status']) => {
    switch (status) {
        case 'pending':
            return { label: 'Pending', variant: 'secondary' as const };
        case 'in-progress':
            return { label: 'In Progress', variant: 'default' as const };
        case 'resolved':
            return { label: 'Resolved', variant: 'outline' as const };
        default:
            return { label: status, variant: 'secondary' as const };
    }
};

const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
};

interface EmergencyReportsListProps {
    reports: EmergencyReport[];
}

export function EmergencyReportsList({ reports }: EmergencyReportsListProps) {
    if (reports.length === 0) {
        return (
            <Card className="text-center py-12">
                <CardContent>
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                        <Shield className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Emergency Reports</h3>
                    <p className="text-gray-600">
                        Click "Report Emergency" to submit your first report
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                    Emergency Reports ({reports.length})
                </h2>
            </div>

            <div className="grid gap-4">
                {reports.map((report) => {
                    const categoryConfig = getCategoryConfig(report.category);
                    const statusConfig = getStatusConfig(report.status);
                    const Icon = categoryConfig.icon;

                    return (
                        <Card key={report.id} className={`border-l-4 ${categoryConfig.borderColor}`}>
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3 flex-1">
                                        <div className={`p-2 rounded-lg ${categoryConfig.bgColor}`}>
                                            <Icon className={`w-5 h-5 ${categoryConfig.color}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-semibold text-gray-900">
                                                    {categoryConfig.label} Emergency
                                                </h3>
                                                <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                                            </div>
                                            <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                                                <Clock className="w-4 h-4" />
                                                <span>{formatTimestamp(report.timestamp)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                {/* Description */}
                                <div>
                                    <p className="text-gray-700">{report.description}</p>
                                </div>

                                {/* Reporter Information */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t">
                                    <div className="flex items-center gap-2 text-sm">
                                        <User className="w-4 h-4 text-gray-500" />
                                        <span className="text-gray-600">Reporter:</span>
                                        <span className="font-medium text-gray-900">{report.reporterName}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <Phone className="w-4 h-4 text-gray-500" />
                                        <span className="text-gray-600">Contact:</span>
                                        <span className="font-medium text-gray-900">{report.contactNumber}</span>
                                    </div>
                                </div>

                                {/* Location */}
                                <div className="flex items-start gap-2 text-sm">
                                    <MapPin className="w-4 h-4 text-gray-500 mt-0.5" />
                                    <div className="flex-1">
                                        <span className="text-gray-600">Location:</span>{' '}
                                        <span className="font-medium text-gray-900">{report.location}</span>
                                        {report.latitude && report.longitude && (
                                            <div className="text-xs text-gray-500 mt-1">
                                                GPS: {report.latitude.toFixed(6)}, {report.longitude.toFixed(6)}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Map Display */}
                                {report.latitude && report.longitude && (
                                    <div className="pt-2">
                                        <LocationMap
                                            latitude={report.latitude}
                                            longitude={report.longitude}
                                            interactive={false}
                                            height="250px"
                                            zoom={16}
                                        />
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}