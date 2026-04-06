import Link from 'next/link';
import { BookOpen, Video, Users, Timer } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-6 border-b">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <BookOpen className="text-white w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-gray-900">Study Buddy</span>
        </div>
        <div className="flex gap-4">
          <Link href="/login" className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-indigo-600">
            Login
          </Link>
          <Link href="/register" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shadow-sm">
            Join for Free
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="px-8 py-20 text-center max-w-4xl mx-auto">
          <h1 className="text-6xl font-extrabold text-gray-900 mb-6 tracking-tight">
            Study together, <span className="text-indigo-600">better.</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 leading-relaxed">
            Join live study rooms with video, audio, and synchronized focus timers. 
            Connect with students worldwide in silent focus or active discussion.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/register" className="px-8 py-4 bg-indigo-600 text-white rounded-lg font-semibold text-lg hover:bg-indigo-700 transition-all">
              Create Your First Room
            </Link>
            <Link href="/dashboard" className="px-8 py-4 border border-gray-300 rounded-lg font-semibold text-lg hover:bg-gray-50 transition-all">
              Browse Topics
            </Link>
          </div>
        </section>

        {/* Features Grid */}
        <section className="bg-gray-50 py-20 px-8">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex flex-col items-center text-center">
              <div className="bg-white p-4 rounded-full shadow-md mb-4">
                <Video className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">Live Video & Audio</h3>
              <p className="text-gray-600">High-quality WebRTC calls with simple toggle controls for privacy.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="bg-white p-4 rounded-full shadow-md mb-4">
                <Timer className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">Sync Study Timers</h3>
              <p className="text-gray-600">Keep the whole group on track with shared Pomodoro timers.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="bg-white p-4 rounded-full shadow-md mb-4">
                <Users className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">Moderated Groups</h3>
              <p className="text-gray-600">Democratic "vote to kick" and Captain controls for a safe space.</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t text-center text-gray-500 text-sm">
        © 2026 Study Buddy. Built for focused learners.
      </footer>
    </div>
  );
}