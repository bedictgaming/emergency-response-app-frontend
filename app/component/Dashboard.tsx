import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { Shield, LogOut, Flame, Heart, AlertTriangle, MapPin } from 'lucide-react';
import { EmergencyReportForm } from './EmergencyReportForm';
import { EmergencyReportsList } from './EmergencyReportList';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Card, CardContent } from './ui/card';
import { useGeolocation } from '../hooks/useGeolocation';
import type { User, EmergencyReport, EmergencyCategory } from '../types';

export function Dashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [reports, setReports] = useState<EmergencyReport[]>([]);
    const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<EmergencyCategory | null>(null);
    const { latitude, longitude, error: locationError } = useGeolocation();

    useEffect(() => {
        // Load user from localStorage
        const userStr = localStorage.getItem('user');
        if (userStr) {
            setUser(JSON.parse(userStr));
        }

        // Load reports from localStorage
        const reportsStr = localStorage.getItem('emergencyReports');
        if (reportsStr) {
            setReports(JSON.parse(reportsStr));
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('user');
        router.push('/');
    };

    const handleReportSubmit = (report: Omit<EmergencyReport, 'id' | 'timestamp' | 'status' | 'userId'>) => {
        if (!user) return;

        const newReport: EmergencyReport = {
            ...report,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            status: 'pending',
            userId: user.id,
        };

        const updatedReports = [newReport, ...reports];
        setReports(updatedReports);
        localStorage.setItem('emergencyReports', JSON.stringify(updatedReports));
        setIsReportDialogOpen(false);
        setSelectedCategory(null);
    };

    const handleQuickReport = (category: EmergencyCategory) => {
        setSelectedCategory(category);
        setIsReportDialogOpen(true);
    };

    return (
        <div className="min-h-screen bg-gray-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                                <Shield className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">Emergency Response</h1>
                                <p className="text-sm text-gray-600">Community Reporting System</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                                <p className="text-xs text-gray-600">{user?.email}</p>
                            </div>
                            <Button onClick={handleLogout} variant="outline" size="sm">
                                <LogOut className="w-4 h-4 mr-2" />
                                Logout
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* GPS Location Display */}
                <Card className="mb-6 bg-gradient-to-r from-blue-50 to-cyan-50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                                <MapPin className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">Real-time GPS Location</p>
                                {latitude && longitude ? (
                                    <p className="text-xs text-gray-600">
                                        {latitude.toFixed(6)}, {longitude.toFixed(6)}
                                    </p>
                                ) : locationError ? (
                                    <p className="text-xs text-red-600">Location access denied - Please enable GPS</p>
                                ) : (
                                    <p className="text-xs text-gray-600">Detecting location...</p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* One-Tap Emergency Categories */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Emergency - One Tap</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Fire */}
                        <Card
                            className="cursor-pointer hover:shadow-lg transition-all border-2 border-orange-200 hover:border-orange-400 bg-gradient-to-br from-orange-50 to-red-50"
                            onClick={() => handleQuickReport('fire')}
                        >
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-3">
                                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
                                    <Flame className="w-8 h-8 text-orange-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-orange-900">Fire</h3>
                                    <p className="text-xs text-orange-700 mt-1">Emergency</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Medical */}
                        <Card
                            className="cursor-pointer hover:shadow-lg transition-all border-2 border-red-200 hover:border-red-400 bg-gradient-to-br from-red-50 to-pink-50"
                            onClick={() => handleQuickReport('medical')}
                        >
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-3">
                                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                                    <Heart className="w-8 h-8 text-red-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-red-900">Medical</h3>
                                    <p className="text-xs text-red-700 mt-1">Emergency</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Police */}
                        <Card
                            className="cursor-pointer hover:shadow-lg transition-all border-2 border-blue-200 hover:border-blue-400 bg-gradient-to-br from-blue-50 to-indigo-50"
                            onClick={() => handleQuickReport('police')}
                        >
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-3">
                                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                                    <Shield className="w-8 h-8 text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-blue-900">Police</h3>
                                    <p className="text-xs text-blue-700 mt-1">Emergency</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Hazard */}
                        <Card
                            className="cursor-pointer hover:shadow-lg transition-all border-2 border-yellow-200 hover:border-yellow-400 bg-gradient-to-br from-yellow-50 to-amber-50"
                            onClick={() => handleQuickReport('hazard')}
                        >
                            <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-3">
                                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                                    <AlertTriangle className="w-8 h-8 text-yellow-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-yellow-900">Hazard</h3>
                                    <p className="text-xs text-yellow-700 mt-1">Emergency</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Reports List */}
                <EmergencyReportsList reports={reports} />
            </main>

            {/* Report Dialog */}
            <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Report Emergency</DialogTitle>
                        <DialogDescription>Fill out the form to report an emergency.</DialogDescription>
                    </DialogHeader>
                    <EmergencyReportForm
                        onSubmit={handleReportSubmit}
                        onCancel={() => setIsReportDialogOpen(false)}
                        defaultName={user?.name || ''}
                        defaultCategory={selectedCategory}
                        latitude={latitude}
                        longitude={longitude}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}