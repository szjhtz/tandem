import React from 'react';
import { Activity, Clock, Plus, Settings, Extension, MessageSquare, Workflow, FileText, Terminal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const quickActions = [
    {
      title: 'New Chat',
      icon: MessageSquare,
      route: '/chat',
      description: 'Start a new conversation with an agent'
    },
    {
      title: 'Create Workflow',
      icon: Workflow,
      route: '/orchestrate',
      description: 'Build and manage workflows'
    },
    {
      title: 'File Browser',
      icon: FileText,
      route: '/files',
      description: 'Explore and manage files'
    },
    {
      title: 'Extensions',
      icon: Extension,
      route: '/extensions',
      description: 'Manage agents and integrations'
    }
  ];

  const recentActivities = [
    {
      id: '1',
      title: 'Chat with Code Assistant',
      time: '2 minutes ago',
      type: 'chat'
    },
    {
      id: '2',
      title: 'Workflow: Daily Summary',
      time: '1 hour ago',
      type: 'workflow'
    },
    {
      id: '3',
      title: 'File: README.md',
      time: '3 hours ago',
      type: 'file'
    }
  ];

  return (
    <div className="p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <button 
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Settings size={18} />
          Settings
        </button>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <div 
                key={action.route}
                onClick={() => navigate(action.route)}
                className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-100 dark:border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                    <Icon size={24} className="text-indigo-600 dark:text-indigo-300" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{action.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{action.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activities */}
      <div>
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Recent Activities</h2>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          {recentActivities.map((activity) => (
            <div key={activity.id} className="p-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{activity.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                    <Clock size={14} />
                    {activity.time}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${activity.type === 'chat' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : activity.type === 'workflow' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
                  {activity.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Status */}
      <div>
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">System Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <Activity size={24} className="text-green-600 dark:text-green-300" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Engine</h3>
                <p className="text-sm text-green-600 dark:text-green-400">Running</p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <MessageSquare size={24} className="text-blue-600 dark:text-blue-300" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Sessions</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">3 active</p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Terminal size={24} className="text-purple-600 dark:text-purple-300" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">Tools</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">12 available</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;