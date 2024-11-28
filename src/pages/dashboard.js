'use client';

import { useEffect, useState } from 'react';
import { firestore } from '../../src/app/firebase';
import { collection, getDocs, Timestamp } from 'firebase/firestore'; // Imported Timestamp
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from 'recharts';
import { Users, Clock, CheckCircle, BookOpen } from 'lucide-react';
import Link from 'next/link'; // Imported Link from next/link

export default function DashboardPage() {
  const [sessionData, setSessionData] = useState([]);
  const [workflowData, setWorkflowData] = useState([]);
  const [userProfileData, setUserProfileData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [sessionSnapshot, workflowSnapshot, userProfileSnapshot] = await Promise.all([
          getDocs(collection(firestore, 'session table')),
          getDocs(collection(firestore, 'workflowData')),
          getDocs(collection(firestore, 'user_profile')),
        ]);

        setSessionData(sessionSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setWorkflowData(workflowSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setUserProfileData(userProfileSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error('Firebase error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Core Metrics Calculations
  const totalUsers = userProfileData?.length || 0;
  const totalSessions = sessionData?.length || 0;

  const calculateAvgTime = () => {
    if (!sessionData || !workflowData) return 0;
    const completionTimes = sessionData
      .map(session => {
        const sessionWorkflows = workflowData.filter(w => w.sessionID === session.sessionID);
        if (sessionWorkflows.length === 0) return 0;

        // Safely convert startTime to Date
        let startTime;
        if (session.startTime instanceof Timestamp) {
          startTime = session.startTime.toDate();
        } else {
          console.warn(`Invalid startTime for sessionID: ${session.sessionID}`);
          return 0; // Skip this session
        }

        // Sort workflows by nextButtonTimestamp descending
        const sortedWorkflows = sessionWorkflows.sort((a, b) => {
          const aTime = a.nextButtonTimestamp instanceof Timestamp ? a.nextButtonTimestamp.toMillis() : 0;
          const bTime = b.nextButtonTimestamp instanceof Timestamp ? b.nextButtonTimestamp.toMillis() : 0;
          return bTime - aTime;
        });

        const lastWorkflow = sortedWorkflows[0];
        if (!lastWorkflow) return 0;

        // Safely convert nextButtonTimestamp to Date
        let endTime;
        if (lastWorkflow.nextButtonTimestamp instanceof Timestamp) {
          endTime = lastWorkflow.nextButtonTimestamp.toDate();
        } else {
          console.warn(`Invalid nextButtonTimestamp for workflowID: ${lastWorkflow.id}`);
          return 0; // Skip this workflow
        }

        return (endTime - startTime) / (1000 * 60); // Convert milliseconds to minutes
      })
      .filter(time => time > 0);
    return completionTimes.length > 0
      ? Math.round(completionTimes.reduce((acc, time) => acc + time, 0) / completionTimes.length)
      : 0;
  };

  const calculateSuccessRate = () => {
    if (!workflowData?.length) return 0;
    const correctFirstAttempts = workflowData.filter(w => w.attempt1Result === 'Correct').length;
    return Math.round((correctFirstAttempts / workflowData.length) * 100);
  };

  const calculateDepartmentDistribution = () => {
    const deptCount = userProfileData.reduce((acc, user) => {
      acc[user.department] = (acc[user.department] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(deptCount).map(([name, value]) => ({
      name,
      value,
      percentage: Math.round((value / totalUsers) * 100),
    }));
  };

  const calculateUserTypeDistribution = () => {
    const typeCount = userProfileData.reduce((acc, user) => {
      const userType = user.userType.charAt(0).toUpperCase() + user.userType.slice(1).toLowerCase();
      acc[userType] = (acc[userType] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(typeCount).map(([name, value]) => ({
      name,
      value,
      percentage: Math.round((value / totalUsers) * 100),
    }));
  };

  const calculateCaseStudyPerformance = () => {
    const casePerformance = workflowData.reduce((acc, workflow) => {
      if (!workflow.workflowName) return acc;
      const caseName = workflow.workflowName.split('-')[0];
      if (!acc[caseName]) {
        acc[caseName] = { total: 0, correct: 0 };
      }
      acc[caseName].total++;
      if (workflow.attempt1Result === 'Correct') {
        acc[caseName].correct++;
      }
      return acc;
    }, {});

    return Object.entries(casePerformance)
      .map(([name, data]) => ({
        case: name,
        successRate: Math.round((data.correct / data.total) * 100),
      }))
      .sort((a, b) => a.case.localeCompare(b.case, undefined, { numeric: true }));
  };

  const calculateDepartmentPerformance = () => {
    if (!workflowData.length || !sessionData.length || !userProfileData.length) {
      console.warn('Data missing: One or more datasets (workflowData, sessionData, userProfileData) are empty.');
      return [];
    }

    const deptPerformance = {};

    workflowData.forEach(workflow => {
      const session = sessionData.find(s => s.sessionID === workflow.sessionID);
      if (!session) {
        console.warn(`No matching session found for workflow with sessionID: ${workflow.sessionID}`);
        return;
      }

      const user = userProfileData.find(u => u.userID === session.employeeID);
      if (!user || !user.department) {
        console.warn(`No matching user or department found for sessionID: ${session.sessionID}`);
        return;
      }

      if (!deptPerformance[user.department]) {
        deptPerformance[user.department] = { department: user.department, correct: 0, total: 0 };
      }

      deptPerformance[user.department].total++;
      if (workflow.attempt1Result === 'Correct') {
        deptPerformance[user.department].correct++;
      }
    });

    return Object.values(deptPerformance).map(dept => ({
      department: dept.department,
      successRate: dept.total > 0 ? Math.round((dept.correct / dept.total) * 100) : 0,
    }));
  };

  const calculateSecondAttemptRate = () => {
    return Math.round(
      (workflowData.filter(w => w.secondAttemptMade === 'yes').length / workflowData.length) * 100
    );
  };

  if (loading) return <div className="text-white">Loading...</div>;
  if (error) return <div className="text-white">Error: {error}</div>;

  const calculateAvgTimePerQuestion = () => {
    if (!workflowData?.length) return 0; // If no data, return 0

    const totalTimeInSeconds = workflowData.reduce((acc, w) => {
      let timeInSeconds = 0;

      // Ensure attempt1Timestamp and nextButtonTimestamp are valid timestamps
      if (w.attempt1Timestamp instanceof Timestamp && w.nextButtonTimestamp instanceof Timestamp) {
        // Convert Firestore Timestamp to Date object and calculate the time difference in seconds
        const startTime = w.attempt1Timestamp.toDate(); // Modified
        const endTime = w.nextButtonTimestamp.toDate(); // Modified

        // Calculate time difference in seconds
        timeInSeconds = (endTime - startTime) / 1000; // Convert milliseconds to seconds
      } else {
        console.warn(`Invalid timestamps for workflowID: ${w.id}`);
      }

      return acc + timeInSeconds;
    }, 0);

    // If no valid data, return 0
    if (totalTimeInSeconds === 0) return 0;

    // Calculate the average time per question in seconds
    const averageTimeInSeconds = totalTimeInSeconds / workflowData.length;

    return averageTimeInSeconds.toFixed(2); // Return the result in seconds, rounded to two decimal places
  };

  const calculateCompletionRate = () => {
    if (!workflowData?.length) return 0;
    const completed = workflowData.filter(w => w.attempt1Result === 'Correct').length;
    return Math.round((completed / workflowData.length) * 100);
  };

  const calculateHighPerformers = () => {
    if (!userProfileData?.length) return 0;
    const highPerformers = userProfileData.filter(user => {
      const userWorkflows = workflowData.filter(w => w.userID === user.userID);
      const successRate =
        userWorkflows.length > 0
          ? (userWorkflows.filter(w => w.attempt1Result === 'Correct').length / userWorkflows.length) * 100
          : 0;
      return successRate > 80; // Threshold for high performers
    }).length;
    return Math.round((highPerformers / totalUsers) * 100);
  };

  const calculateQuestionsPerUser = () => {
    return workflowData.length && totalUsers ? Math.round(workflowData.length / totalUsers) : 0;
  };

  const calculateSecondAttemptSuccessRate = () => {
    const secondAttempts = workflowData.filter(w => w.secondAttemptMade === 'yes');
    const correctSecondAttempts = secondAttempts.filter(w => w.attempt2Result === 'Correct').length;
    return Math.round((correctSecondAttempts / secondAttempts.length) * 100);
  };

  const calculateSkippedQuestions = () => {
    const skipped = workflowData.filter(w => w.attempt1Selection === 'Skipped');
    return Math.round((skipped.length / workflowData.length) * 100);
  };

  const calculateFastestCompletionTime = () => {
    if (!sessionData?.length) return 0;
    const times = sessionData
      .map(session => {
        const sessionWorkflows = workflowData.filter(w => w.sessionID === session.sessionID);
        if (!sessionWorkflows.length) return null;

        // Safely convert startTime to Date
        let start;
        if (session.startTime instanceof Timestamp) {
          start = session.startTime.toDate();
        } else {
          console.warn(`Invalid startTime for sessionID: ${session.sessionID}`);
          return null;
        }

        // Safely convert nextButtonTimestamp to Date
        const lastWorkflow = sessionWorkflows[sessionWorkflows.length - 1];
        let end;
        if (lastWorkflow.nextButtonTimestamp instanceof Timestamp) {
          end = lastWorkflow.nextButtonTimestamp.toDate();
        } else {
          console.warn(`Invalid nextButtonTimestamp for workflowID: ${lastWorkflow.id}`);
          return null;
        }

        return (end - start) / (1000 * 60); // Convert milliseconds to minutes
      })
      .filter(time => time !== null);
    return times.length > 0 ? Math.min(...times).toFixed(1) : 0;
  };

  const calculateMedianCompletionTime = () => {
    if (!sessionData?.length) return 0;
    const times = sessionData
      .map(session => {
        const sessionWorkflows = workflowData.filter(w => w.sessionID === session.sessionID);
        if (!sessionWorkflows.length) return null;

        // Safely convert startTime to Date
        let start;
        if (session.startTime instanceof Timestamp) {
          start = session.startTime.toDate();
        } else {
          console.warn(`Invalid startTime for sessionID: ${session.sessionID}`);
          return null;
        }

        // Safely convert nextButtonTimestamp to Date
        const lastWorkflow = sessionWorkflows[sessionWorkflows.length - 1];
        let end;
        if (lastWorkflow.nextButtonTimestamp instanceof Timestamp) {
          end = lastWorkflow.nextButtonTimestamp.toDate();
        } else {
          console.warn(`Invalid nextButtonTimestamp for workflowID: ${lastWorkflow.id}`);
          return null;
        }

        return (end - start) / (1000 * 60); // Convert milliseconds to minutes
      })
      .filter(time => time !== null);
    if (times.length === 0) return 0;

    const sorted = times.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
  };

  const calculateFirstAttemptSuccessRate = () => {
    if (!workflowData?.length) return 0; // If no data, return 0

    // Count how many first attempts were correct
    const correctFirstAttempts = workflowData.filter(w => w.attempt1Result === 'Correct').length;

    // Calculate the total number of first attempts
    const totalFirstAttempts = workflowData.length;

    // Calculate the success rate (correct attempts / total attempts) and convert to percentage
    return Math.round((correctFirstAttempts / totalFirstAttempts) * 100);
  };

  const calculateFailedAfterSecondAttempt = () => {
    const secondAttempts = workflowData.filter(w => w.secondAttemptMade === 'yes');
    const failedSecondAttempts = secondAttempts.filter(w => w.attempt2Result !== 'Correct').length;
    return secondAttempts.length > 0
      ? Math.round((failedSecondAttempts / secondAttempts.length) * 100)
      : 0;
  };

  const COLORS = ['#F86CCF', '#9333EA', '#45B7D1', '#96CEB4'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-8">
              <img src="/piedmont-logo.png" alt="Piedmont" className="h-12 object-contain" />
              <div className="w-px h-8 bg-gray-300"></div>
              <img src="/coachcare-logo.png" alt="CoachCare" className="h-12 object-contain" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Training & Certification Dashboard</h1>
          </div>
        </div>
      </header>
      
      {/* App Bar with Navigation Buttons */}
      <nav className="bg-blue-600 p-4 flex justify-end space-x-4">
        <Link href="/" className="text-white font-semibold hover:bg-blue-700 px-3 py-2 rounded">
          Home
        </Link>
        <Link href="/dashboard" className="text-white font-semibold hover:bg-blue-700 px-3 py-2 rounded">
          Dashboard
        </Link>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-3xl font-bold text-gray-900">{totalUsers}</p>
              </div>
              <Users className="h-10 w-10 text-[#F86CCF]" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Sessions</p>
                <p className="text-3xl font-bold text-gray-900">{totalSessions}</p>
              </div>
              <BookOpen className="h-10 w-10 text-[#9333EA]" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg. Completion Time</p>
                <p className="text-3xl font-bold text-gray-900">{calculateAvgTime()}m</p>
              </div>
              <Clock className="h-10 w-10 text-[#45B7D1]" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Success Rate</p>
                <p className="text-3xl font-bold text-gray-900">{calculateSuccessRate()}%</p>
              </div>
              <CheckCircle className="h-10 w-10 text-[#96CEB4]" />
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Department Distribution</h3>
            <ResponsiveContainer height={300}>
              <PieChart>
                <Pie data={calculateDepartmentDistribution()} dataKey="value" nameKey="name" outerRadius={100}>
                  {calculateDepartmentDistribution().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">User Type Distribution</h3>
            <ResponsiveContainer height={300}>
              <PieChart>
                <Pie data={calculateUserTypeDistribution()} dataKey="value" nameKey="name" outerRadius={100}>
                  {calculateUserTypeDistribution().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Case Study Performance */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Case Study Performance</h3>
            <ResponsiveContainer height={300}>
              <BarChart data={calculateCaseStudyPerformance()} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="case" />
                <Bar dataKey="successRate" radius={[10, 10, 0, 0]}>
                  {calculateCaseStudyPerformance().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                  <LabelList dataKey="successRate" position="top" formatter={value => `${value}%`} />
                </Bar>
                <Tooltip />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Department Performance */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Department Performance</h3>
            <ResponsiveContainer height={300}>
              <BarChart data={calculateDepartmentPerformance()} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" />
                <Bar dataKey="successRate" radius={[10, 10, 0, 0]}>
                  {calculateDepartmentPerformance().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                  <LabelList dataKey="successRate" position="top" formatter={value => `${value}%`} />
                </Bar>
                <Tooltip />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Training Engagement Metrics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Training Engagement</h3>
          <div className="space-y-4">
            {/* Existing Metrics */}
            <div className="flex justify-between items-center">
              <span className="text-gray-600">First Attempt Success Rate</span>
              <span className="text-2xl font-bold text-[#45B7D1]">
                {calculateFirstAttemptSuccessRate()}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Second Attempt Success Rate</span>
              <span className="text-2xl font-bold text-[#45B7D1]">
                {calculateSecondAttemptSuccessRate()}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600">Failed After Second Attempt</span>
              <span className="text-2xl font-bold text-[#96CEB4]">
                {calculateFailedAfterSecondAttempt()}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600">Average Questions per Session</span>
              <span className="text-2xl font-bold text-[#9333EA]">
                {Math.round(workflowData.length / totalSessions)}
              </span>
            </div>

            {/* New Metrics */}
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Average Time per Question</span>
              <span className="text-2xl font-bold text-[#45B7D1]">
                {calculateAvgTimePerQuestion()} sec
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Completion Rate</span>
              <span className="text-2xl font-bold text-[#96CEB4]">
                {calculateCompletionRate()}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">High Performers</span>
              <span className="text-2xl font-bold text-[#F86CCF]">
                {calculateHighPerformers()}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600">Fastest Completion Time</span>
              <span className="text-2xl font-bold text-[#F86CCF]">
                {calculateFastestCompletionTime()}m
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Median Time to Complete Training</span>
              <span className="text-2xl font-bold text-[#9333EA]">
                {calculateMedianCompletionTime()}m
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
