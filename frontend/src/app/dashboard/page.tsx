'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useRouter } from 'next/navigation';
import axios from '@/lib/axios';
import { BookOpen, LogOut, Plus, Video } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [meetings, setMeetings] = useState([]);
  
  // New state for creating subjects
  const [showSubjectInput, setShowSubjectInput] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');

  useEffect(() => {
    if (!isAuthenticated) router.push('/login');
    else fetchSubjects();
  }, [isAuthenticated, router]);

  const fetchSubjects = async () => {
    try {
      const { data } = await axios.get('/api/subjects');
      setSubjects(data.subjects);
      if (data.subjects.length > 0) handleSelectSubject(data.subjects[0]);
    } catch (err) {
      toast.error('Failed to load subjects');
    }
  };

  const handleSelectSubject = async (subject: any) => {
    setSelectedSubject(subject);
    try {
      const { data } = await axios.get(`/api/meetings/subject/${subject._id}`);
      setMeetings(data.meetings);
    } catch (err) {
      toast.error('Failed to load meetings');
    }
  };

  // ── NEW: Create Subject Function ──
  const handleCreateSubject = async () => {
    if (!newSubjectName.trim()) return;
    try {
      const { data } = await axios.post('/api/subjects', {
        name: newSubjectName,
        description: 'Custom Study Group',
      });
      setSubjects((prev: any) => [...prev, data.subject] as any);
      setNewSubjectName('');
      setShowSubjectInput(false);
      handleSelectSubject(data.subject); // Auto-select the new subject
      toast.success('Subject created!');
    } catch (err) {
      toast.error('Failed to create subject');
    }
  };

  const createMeeting = async () => {
    if (!selectedSubject) return;
    try {
      const { data } = await axios.post('/api/meetings', {
        title: `Study Session for ${selectedSubject.name}`,
        subjectId: selectedSubject._id,
        scheduledAt: new Date(Date.now() + 5 * 60000), // Schedules for 5 mins from now
        duration: 60,
      });
      setMeetings((prev: any) => [...prev, data.meeting] as any);
      toast.success('Meeting created!');
    } catch (err) {
      toast.error('Failed to create meeting');
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2 font-bold text-xl text-indigo-600">
          <BookOpen /> Study Buddy
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-600 font-medium">{user.name}</span>
          <button onClick={() => { logout(); router.push('/'); }} className="p-2 text-gray-400 hover:text-red-500 transition">
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto p-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Subjects Sidebar */}
        <div className="col-span-1 bg-white rounded-xl shadow-sm border p-4 h-fit">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Your Subjects</h2>
            <button 
              onClick={() => setShowSubjectInput(!showSubjectInput)} 
              className="text-indigo-600 hover:text-indigo-800 p-1 bg-indigo-50 rounded-md"
              title="Add Subject"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* New Subject Input Box */}
          {showSubjectInput && (
            <div className="mb-4 flex flex-col gap-2 p-2 bg-gray-50 border rounded-lg">
              <input
                type="text"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="Subject Name (e.g. Math)"
                className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSubject()}
              />
              <div className="flex gap-2">
                <button onClick={handleCreateSubject} className="flex-1 bg-indigo-600 text-white py-1.5 rounded-md text-xs font-bold hover:bg-indigo-700">Save</button>
                <button onClick={() => setShowSubjectInput(false)} className="flex-1 bg-gray-200 text-gray-700 py-1.5 rounded-md text-xs font-bold hover:bg-gray-300">Cancel</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {subjects.map((sub: any) => (
              <button
                key={sub._id}
                onClick={() => handleSelectSubject(sub)}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${
                  selectedSubject?._id === sub._id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {sub.name}
              </button>
            ))}
            {subjects.length === 0 && !showSubjectInput && (
              <p className="text-sm text-gray-500 px-2 text-center py-4">Click the + to add a subject</p>
            )}
          </div>
        </div>

        {/* Meetings Feed */}
        <div className="col-span-1 md:col-span-3">
          {selectedSubject ? (
            <>
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">{selectedSubject.name} Meetings</h1>
                <button onClick={createMeeting} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                  <Plus size={18} /> New Session
                </button>
              </div>
              <div className="grid gap-4">
                {meetings.map((meeting: any) => (
                  <div key={meeting._id} className="bg-white p-6 rounded-xl shadow-sm border flex justify-between items-center hover:border-indigo-100 transition-colors">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">{meeting.title}</h3>
                      <p className="text-sm text-gray-500">
                        {new Date(meeting.scheduledAt).toLocaleString()} • {meeting.studyMode} mode
                      </p>
                    </div>
                    <button
                      onClick={() => router.push(`/room/${meeting.roomId}`)}
                      className="flex items-center gap-2 bg-green-100 text-green-700 hover:bg-green-200 px-6 py-3 rounded-lg font-bold transition-colors"
                    >
                      <Video size={18} /> Join Room
                    </button>
                  </div>
                ))}
                {meetings.length === 0 && (
                  <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
                    <h3 className="text-lg font-medium text-gray-900 mb-1">No active sessions</h3>
                    <p className="text-gray-500 mb-4">Start a new study session for {selectedSubject.name}</p>
                    <button onClick={createMeeting} className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-100 font-medium">
                      Create first session
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-white rounded-xl border border-dashed">
              <BookOpen size={48} className="mb-4 text-gray-300" />
              <p>Create or select a subject on the left to view meetings</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}