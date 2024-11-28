"use client";

import React, { useState, useEffect, useRef } from 'react';
import Script from 'next/script';
import Head from 'next/head';
import Link from 'next/link';

// Import Firestore functions
import {
  collection,
  addDoc,
  writeBatch,
  getDocs,
  query,
  deleteDoc,
  doc,
  setDoc,
} from 'firebase/firestore';
import { firestore } from '../firebase';

// Import jsPDF for PDF generation
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function Home() {
  // State Variables
  const [caseStudies, setCaseStudies] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentCaseStudyIndex, setCurrentCaseStudyIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [userType, setUserType] = useState('');
  const [showCaseStudies, setShowCaseStudies] = useState(false);
  const [showSafetyStatement, setShowSafetyStatement] = useState(true);
  const [assessmentComplete, setAssessmentComplete] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [userID, setUserID] = useState('');
  const [fullName, setFullName] = useState('');
  const [language, setLanguage] = useState('english');
  const [showTranslate, setShowTranslate] = useState(true);

  // Audio-related states
  const [audioUrl, setAudioUrl] = useState(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioError, setAudioError] = useState('');

  const audioRef = useRef(null);

  // State to track current question within a case study
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // New state variables for feedback messages and attempts
  const [feedbackMessages, setFeedbackMessages] = useState({});
  const [attempts, setAttempts] = useState({});

  // State variables for score and result details
  const [totalScore, setTotalScore] = useState(0);
  const [resultDetails, setResultDetails] = useState([]);

  // State variable to track current result case study
  const [currentResultCaseStudyIndex, setCurrentResultCaseStudyIndex] = useState(0);

  // State variables for sessionID and workflowData
  const [sessionID, setSessionID] = useState('');
  const [workflowData, setWorkflowData] = useState([]);

  // Generate Speech Function
  const generateSpeech = async () => {
    if (!currentCaseStudy) return;
    setIsAudioLoading(true);
    setAudioError('');
    try {
      const response = await fetch('/api/audio-models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: currentCaseStudy.scenario,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        return url;
      } else {
        const data = await response.json();
        console.error('Error from server:', data.error);
        setAudioError(data.error || 'Failed to generate audio.');
        return null;
      }
    } catch (error) {
      console.error('Error calling API:', error);
      setAudioError('An unexpected error occurred.');
      return null;
    } finally {
      setIsAudioLoading(false);
    }
  };

  // Fetch Audio and Toggle Play/Pause
  const fetchAudio = async () => {
    if (isAudioPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsAudioPlaying(false);
    } else {
      // Generate new speech URL for the current case study
      const url = await generateSpeech();
      if (url && audioRef.current) {
        playAudio(url);
      }
    }
  };

  // Play or Pause Audio Function
  const playAudio = (url) => {
    if (audioRef.current) {
      if (audioRef.current.src === url && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsAudioPlaying(false);
      } else {
        audioRef.current.src = url;
        audioRef.current
          .play()
          .then(() => {
            setIsAudioPlaying(true);
          })
          .catch((error) => {
            console.error('Error playing audio:', error);
            setAudioError('Failed to play audio.');
          });
      }
    }
  };

  // Stop audio when switching case studies
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    // Reset audio-related states when changing case study
    setAudioUrl(null);
    setIsAudioPlaying(false);
    setAudioError('');
    setCurrentQuestionIndex(0); // Reset question index when changing case study
  }, [currentCaseStudyIndex]);

  // Handle Audio Play/Pause State
  useEffect(() => {
    const handleAudioEnded = () => {
      setIsAudioPlaying(false);
    };

    const handleAudioPause = () => {
      setIsAudioPlaying(false);
    };

    const audioElement = audioRef.current;
    if (audioElement) {
      audioElement.addEventListener('ended', handleAudioEnded);
      audioElement.addEventListener('pause', handleAudioPause);
    }

    return () => {
      if (audioElement) {
        audioElement.removeEventListener('ended', handleAudioEnded);
        audioElement.removeEventListener('pause', handleAudioPause);
      }
    };
  }, []);

  // Function to save user inputs to Firestore
  const saveUserInputs = async () => {
    try {
      await addDoc(collection(firestore, 'user_profile'), {
        userID,
        fullName,
        language,
        userType,
        department,
        role,
        specialization,
      });
      console.log('User inputs saved successfully.');
    } catch (error) {
      console.error('Error saving user inputs:', error.message);
      setError('Failed to save your inputs. Please try again.');
      throw error; // Propagate error to handleSubmitFinalAssessment
    }
  };

  // Function to save AI response to Firestore
  const saveAiResponse = async () => {
    if (!aiResponse) return;

    try {
      // Save aiResponse inside an object
      await addDoc(collection(firestore, 'ai_responses'), { aiResponse });
      console.log('AI response saved successfully.');
    } catch (error) {
      console.error('Error saving AI response:', error.message);
      setError('Failed to save AI response. Please try again.');
      throw error;
    }
  };

  // Function to save case studies to both collections
  const saveCaseStudies = async () => {
    if (!caseStudies || caseStudies.length === 0) return;

    try {
      // Initialize batch for all_case_studies
      const allCaseStudiesBatch = writeBatch(firestore);
      const allCaseStudiesCollection = collection(firestore, 'all_case_studies');

      caseStudies.forEach((caseStudy) => {
        // Create a new document reference with auto-generated ID for all_case_studies
        const allCaseStudiesDocRef = doc(allCaseStudiesCollection);
        allCaseStudiesBatch.set(allCaseStudiesDocRef, {
          ...caseStudy,
        });
      });

      // Commit the batch
      await allCaseStudiesBatch.commit();

      console.log('Case studies saved to all_case_studies collection successfully.');
    } catch (error) {
      console.error('Error saving case studies:', error.message);
      setError('Failed to save case studies. Please try again.');
      throw error; // Propagate error to handleSubmitFinalAssessment
    }
  };

  // Function to save session data to Firestore
  const saveSessionData = async (sessionID) => {
    try {
      await addDoc(collection(firestore, 'session table'), {
        sessionID: sessionID,
        employeeID: userID,
        startTime: new Date(),
      });
      console.log('Session data saved successfully.');
    } catch (error) {
      console.error('Error saving session data:', error);
      // Handle error if needed
    }
  };

  // Function to save workflow data to Firestore
  const saveWorkflowData = async (data) => {
    try {
      const docRef = doc(firestore, 'workflowData', `${sessionID}_${data.workflowID}`);
      await setDoc(docRef, data, { merge: true });
    } catch (error) {
      console.error('Error saving workflow data:', error);
    }
  };

  // Handle taking the assessment
  const handleTakeAssessment = () => {
    if (!userType) {
      setError('Please select your User Type before proceeding.');
      return;
    }

    if (!role || !department) {
      setError('Please select your Role and Department before proceeding.');
      return;
    }

    if (userType === 'clinical' && !specialization) {
      setError('Please select your Specialization before proceeding.');
      return;
    }

    // Save user inputs when the assessment starts
    saveUserInputs();

    const randomSessionID = Math.floor(100000 + Math.random() * 900000).toString();
    setSessionID(randomSessionID);
    saveSessionData(randomSessionID);

    handleSubmitAssessment();
    // Hide the Google Translate menu after clicking the button
    setShowTranslate(false);
  };

  // Handle submitting the assessment
  const handleSubmitAssessment = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ai-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userType, department, role, specialization }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Failed to fetch case studies: ${errorData.error || 'Unknown error'}`
        );
      }

      const data = await response.json();

      if (!data.caseStudies || !Array.isArray(data.caseStudies)) {
        throw new Error('Invalid data format received from server.');
      }

      // Set both caseStudies and aiResponse
      setCaseStudies(data.caseStudies);
      setAiResponse(data.aiResponse); // New line added

      // Generate workflow data
      const workflowNames = ['Take Assessment'];

      data.caseStudies.forEach((caseStudy, caseIndex) => {
        caseStudy.questions.forEach((question, questionIndex) => {
          const workflowName = `Case${caseIndex + 1}-Question${questionIndex + 1}`;
          workflowNames.push(workflowName);
        });
      });

      const workflows = workflowNames.map((name) => ({
        workflowID: Math.floor(100000 + Math.random() * 900000).toString(),
        workflowName: name,
      }));

      setWorkflowData(workflows);

      await saveAiResponse(); // Save AI response

      setShowSafetyStatement(false);
      setShowCaseStudies(true);
      setCurrentCaseStudyIndex(0);
      setCurrentQuestionIndex(0);
    } catch (err) {
      setError(err.message || 'An error occurred');
      console.error('Error fetching case studies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to get Workflow ID
  const getWorkflowID = (caseIndex, questionIndex) => {
    let count = 1; // Start from 1 because 'Take Assessment' is at index 0
    for (let i = 0; i < caseIndex; i++) {
      count += caseStudies[i].questions.length;
    }
    count += questionIndex;
    return workflowData[count]?.workflowID || '';
  };

  // Function to get Workflow Name
  const getWorkflowName = (caseIndex, questionIndex) => {
    return `Case${caseIndex + 1}-Question${questionIndex + 1}`;
  };

  // Modified handleAnswerChange function
  const handleAnswerChange = (caseIndex, questionIndex, selectedOption) => {
    const key = `${caseIndex}-${questionIndex}`;
    const currentAttempts = attempts[key] || 0;

    const previousFeedback = feedbackMessages[caseIndex]?.[questionIndex];

    if (
      currentAttempts >= 3 ||
      (previousFeedback && previousFeedback.message === 'Correct Answer')
    ) {
      // User has reached maximum attempts or already answered correctly
      setError('No more tries left!');
      return;
    }

    // Clear any previous error
    setError(null);

    // Cross-check with correctAnswer from aiResponse
    const correctAnswer = aiResponse[caseIndex].questions[questionIndex].correctAnswer;
    const correctKey = correctAnswer.split(')')[0].trim(); // Extract the key (e.g., 'C')

    const hint = aiResponse[caseIndex].questions[questionIndex].hint;

    let feedbackMessageNew = '';
    let hintToShow = '';

    const isCorrect = selectedOption === correctKey;

    if (isCorrect) {
      feedbackMessageNew = 'Correct Answer';
      hintToShow = ''; // No hint needed when correct
    } else {
      const attemptsLeft = 2 - currentAttempts;
      hintToShow = hint; // Show hint on every incorrect attempt
      if (attemptsLeft > 0) {
        feedbackMessageNew = `Incorrect Answer. ${attemptsLeft} tries left.`;
      } else {
        feedbackMessageNew = 'Incorrect Answer. No more tries left!';
      }
    }

    // Update the feedback messages
    setFeedbackMessages((prevFeedback) => ({
      ...prevFeedback,
      [caseIndex]: {
        ...prevFeedback[caseIndex],
        [questionIndex]: {
          message: feedbackMessageNew,
          hint: hintToShow,
        },
      },
    }));

    // Update the attempts
    setAttempts((prevAttempts) => ({
      ...prevAttempts,
      [key]: currentAttempts + 1,
    }));

    // Update the selected answers
    setSelectedAnswers((prevAnswers) => ({
      ...prevAnswers,
      [caseIndex]: {
        ...prevAnswers[caseIndex],
        [questionIndex]: selectedOption,
      },
    }));

    // Get Workflow ID and Name
    const workflowID = getWorkflowID(caseIndex, questionIndex);
    const workflowName = getWorkflowName(caseIndex, questionIndex);
    const timestamp = new Date();
    const isFirstAttempt = currentAttempts === 0;

    const dataToSave = {
      workflowID: workflowID,
      sessionID: sessionID,
      workflowName: workflowName,
    };

    if (isFirstAttempt) {
      dataToSave.attempt1Selection = 'yes';
      dataToSave.attempt1Timestamp = timestamp;
      dataToSave.attempt1Answer = selectedOption;
      dataToSave.attempt1Result = isCorrect ? 'Correct' : 'Incorrect';
      dataToSave.secondAttemptMade = 'no'; // Record that second attempt was not made yet
    } else {
      dataToSave.attempt2Selection = 'yes';
      dataToSave.attempt2Timestamp = timestamp;
      dataToSave.attempt2Answer = selectedOption;
      dataToSave.attempt2Result = isCorrect ? 'Correct' : 'Incorrect';
      dataToSave.secondAttemptMade = 'yes'; // Record that second attempt was made
    }

    saveWorkflowData(dataToSave);
  };

  // Function to calculate the score
  const calculateScore = () => {
    let score = 0;
    let totalQuestions = 0;
    const details = [];

    // Iterate over each case study
    caseStudies.forEach((caseStudy, caseIndex) => {
      const caseDetail = {
        caseStudyNumber: caseIndex + 1,
        questions: [],
        patientName: caseStudy.patientName || 'Patient: Unknown',
        caseStudyText: caseStudy.scenario || 'No Scenario',
      };

      const questions = caseStudy.questions;
      totalQuestions += questions.length;

      questions.forEach((question, questionIndex) => {
        const userAnswer = selectedAnswers[caseIndex]?.[questionIndex];
        const correctAnswer = aiResponse[caseIndex].questions[questionIndex].correctAnswer;
        const correctKey = correctAnswer.split(')')[0].trim(); // e.g., 'C'

        const key = `${caseIndex}-${questionIndex}`;
        const currentAttempts = attempts[key] || 0;
        const feedbackMessage = feedbackMessages[caseIndex]?.[questionIndex];

        let isCorrect = false;
        if (feedbackMessage?.message === 'Correct Answer') {
          isCorrect = true;
          score += 1;
        } else {
          isCorrect = false;
        }

        caseDetail.questions.push({
          questionNumber: questionIndex + 1,
          questionText: question.question,
          selectedAnswer: userAnswer || 'No Answer',
          isCorrect: isCorrect,
        });
      });

      details.push(caseDetail);
    });

    const percentageScore = Math.round((score / totalQuestions) * 100);
    setTotalScore(percentageScore);
    setResultDetails(details);
  };

  // Handle submitting the final assessment
  const handleSubmitFinalAssessment = () => {
    proceedWithSubmission();
  };

  // Function to proceed with submission
  const proceedWithSubmission = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await saveCaseStudies(); // Save case studies to both collections
      await saveAiResponse(); // Save AI response

      // Save Submit Button Timestamp
      const lastCaseIndex = caseStudies.length - 1;
      const lastQuestionIndex = caseStudies[lastCaseIndex].questions.length - 1;
      const workflowID = getWorkflowID(lastCaseIndex, lastQuestionIndex);
      const workflowName = getWorkflowName(lastCaseIndex, lastQuestionIndex);
      const timestamp = new Date();

      const dataToSave = {
        workflowID: workflowID,
        sessionID: sessionID,
        workflowName: workflowName,
        submitButtonTimestamp: timestamp,
      };

      await saveWorkflowData(dataToSave);

      setAssessmentComplete(true);
      setShowCaseStudies(false);
      setShowSafetyStatement(false);
      calculateScore(); // Calculate the score after assessment completion
    } catch (err) {
      setError(err.message || 'An error occurred during submission.');
      console.error('Error during submission:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Next Button Click
  const handleNext = () => {
    setError(null); // Clear error if any
    // Check if user has selected an answer
    if (
      !selectedAnswers[currentCaseStudyIndex] ||
      !selectedAnswers[currentCaseStudyIndex][currentQuestionIndex]
    ) {
      setError('Please select an answer');
      return;
    }

    // Get Workflow ID and Name
    const workflowID = getWorkflowID(currentCaseStudyIndex, currentQuestionIndex);
    const workflowName = getWorkflowName(currentCaseStudyIndex, currentQuestionIndex);
    const timestamp = new Date();

    const dataToSave = {
      workflowID: workflowID,
      sessionID: sessionID,
      workflowName: workflowName,
      nextButtonTimestamp: timestamp,
    };

    saveWorkflowData(dataToSave);

    if (!isLastQuestion) {
      // Move to next question in the current case study
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else if (!isLastCaseStudy) {
      // Move to first question of next case study
      setCurrentCaseStudyIndex(currentCaseStudyIndex + 1);
      setCurrentQuestionIndex(0);
    } else {
      // Last question of last case study, proceed to submit
      handleSubmitFinalAssessment();
    }
  };

  // Handler to navigate back to main page and clear current session data
  const handleBackToMainPage = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await deleteAllDocumentsInCollection('user_profile');
      await deleteAllDocumentsInCollection('all_case_studies');
      await deleteAllDocumentsInCollection('ai_responses');

      setUserType('');
      setDepartment('');
      setRole('');
      setSpecialization('');
      setCaseStudies([]);
      setSelectedAnswers({});
      setFeedbackMessages({});
      setAttempts({});
      setAssessmentComplete(false);
      setShowSafetyStatement(true);
      setShowCaseStudies(false);
      setResultDetails([]);
      setTotalScore(0);
      setCurrentResultCaseStudyIndex(0);
      setFullName('');
    } catch (err) {
      setError(err.message || 'Failed to navigate back to the main page.');
      console.error('Error navigating back:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to delete all documents in a collection
  const deleteAllDocumentsInCollection = async (collectionName) => {
    const collectionRef = collection(firestore, collectionName);
    const q = query(collectionRef);
    const querySnapshot = await getDocs(q);

    const batch = writeBatch(firestore);
    querySnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  };

  // Modified handlePrint function
  const handlePrint = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const docPDF = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        putOnlyUsedFonts: true,
        floatPrecision: 16, // or "smart", default is 16
      });

      const pageWidth = docPDF.internal.pageSize.getWidth();
      const pageHeight = docPDF.internal.pageSize.getHeight();
      const margin = 10;
      let yPosition = margin;

      // Add User Information
      docPDF.setFontSize(10);
      docPDF.setFont('helvetica', 'bold');
      docPDF.text(`Full Name: ${fullName}`, margin, yPosition);
      yPosition += 6;
      docPDF.text(`User ID: ${userID}`, margin, yPosition);
      yPosition += 6;
      docPDF.text(`Assessment Date: ${new Date().toLocaleDateString()}`, margin, yPosition);
      yPosition += 8; // Added margin space here

      // Add Title
      docPDF.setFontSize(14);
      docPDF.setFont('helvetica', 'bold');
      docPDF.text('Safety Assessment Report', pageWidth / 2, yPosition, {
        align: 'center',
      });
      yPosition += 8;

      // Add Total Score
      docPDF.setFontSize(12);
      docPDF.setFont('helvetica', 'normal');
      docPDF.text(`Total Score: ${totalScore}%`, pageWidth / 2, yPosition, {
        align: 'center',
      });
      yPosition += 8;

      // Add a horizontal line
      docPDF.setLineWidth(0.3);
      docPDF.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 8;

      // Iterate through each case study to add details
      resultDetails.forEach((caseDetail, index) => {
        // Add a new page for each case study except the first one
        if (index !== 0) {
          docPDF.addPage();
          yPosition = margin;
        }

        const caseStudy = caseStudies[index];

        // Add Case Study Title
        docPDF.setFontSize(12);
        docPDF.setFont('helvetica', 'bold');
        docPDF.text(`Case Study ${caseDetail.caseStudyNumber}`, margin, yPosition);
        yPosition += 6;

        // Add Scenario
        docPDF.setFontSize(10);
        docPDF.setFont('helvetica', 'normal');
        const splitScenarioText = docPDF.splitTextToSize(
          caseStudy.scenario,
          pageWidth - 2 * margin
        );
        docPDF.text(splitScenarioText, margin, yPosition);
        yPosition += splitScenarioText.length * 5 + 2; // Adjust spacing based on number of lines

        // Iterate through each question to add question text, user answer, and correct answer
        caseDetail.questions.forEach((question) => {
          const questionNumber = question.questionNumber;
          const questionText = question.questionText;
          const userAnswerKey = question.selectedAnswer;
          const correctAnswerKey = aiResponse[caseDetail.caseStudyNumber - 1].questions[questionNumber - 1].correctAnswer.split(')')[0].trim();

          // Retrieve full text for user answer
          const userOption = caseStudies[index].questions[questionNumber - 1].options.find(
            (opt) => opt.key === userAnswerKey
          );
          const userAnswerText = userOption ? `${userOption.key}. ${userOption.label}` : 'No Answer';

          // Retrieve full text for correct answer
          const correctOption = caseStudies[index].questions[questionNumber - 1].options.find(
            (opt) => opt.key === correctAnswerKey
          );
          const correctAnswerText = correctOption ? `${correctOption.key}. ${correctOption.label}` : 'No Answer';

          // Add Question Number and Text
          docPDF.setFontSize(10);
          docPDF.setFont('helvetica', 'bold');
          const questionHeader = `Question ${questionNumber}: ${questionText}`;
          const splitQuestionHeader = docPDF.splitTextToSize(
            questionHeader,
            pageWidth - 2 * margin
          );
          docPDF.text(splitQuestionHeader, margin, yPosition);
          yPosition += splitQuestionHeader.length * 4 + 2;

          // Add Your Answer
          docPDF.setFontSize(10);
          docPDF.setFont('helvetica', 'bold');
          docPDF.text('Your Answer:', margin + 2, yPosition);
          yPosition += 4;

          docPDF.setFontSize(10);
          docPDF.setFont('helvetica', 'normal');
          const splitUserAnswer = docPDF.splitTextToSize(
            userAnswerText,
            pageWidth - 2 * margin - 4
          );
          docPDF.text(splitUserAnswer, margin + 4, yPosition);
          yPosition += splitUserAnswer.length * 4 + 2;

          // Add Correct Answer
          docPDF.setFontSize(10);
          docPDF.setFont('helvetica', 'bold');
          docPDF.text('Correct Answer:', margin + 2, yPosition);
          yPosition += 4;

          docPDF.setFontSize(10);
          docPDF.setFont('helvetica', 'normal');
          const splitCorrectAnswer = docPDF.splitTextToSize(
            correctAnswerText,
            pageWidth - 2 * margin - 4
          );
          docPDF.text(splitCorrectAnswer, margin + 4, yPosition);
          yPosition += splitCorrectAnswer.length * 4 + 6;

          // Check if yPosition exceeds page height, adjust if necessary
          if (yPosition > pageHeight - margin - 20) {
            // Avoid adding extra blank pages
            // If content exceeds, reduce font size or truncate (optional)
            // For simplicity, we'll assume content fits due to smaller font size
            yPosition = pageHeight - margin - 20;
          }
        });

        // No spacing between case studies since each is on a new page
      });

      // Save the PDF with a dynamic filename
      const fileName = `Safety_Assessment_Report_${fullName.replace(/\s+/g, '_')}_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`;
      docPDF.save(fileName);
    } catch (err) {
      setError(err.message || 'Failed to generate PDF.');
      console.error('Error generating PDF:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle page refresh
  const handlePageRefresh = async () => {
    try {
      await deleteAllDocumentsInCollection('all_case_studies');
      await deleteAllDocumentsInCollection('ai_responses');
      await deleteAllDocumentsInCollection('session table');
      await deleteAllDocumentsInCollection('user_profile');
      await deleteAllDocumentsInCollection('workflowData');

      setUserType('');
      setDepartment('');
      setRole('');
      setSpecialization('');
      setCaseStudies([]);
      setSelectedAnswers({});
      setFeedbackMessages({});
      setAttempts({});
      setAssessmentComplete(false);
      setShowSafetyStatement(true);
      setShowCaseStudies(false);
      setResultDetails([]);
      setTotalScore(0);
      setCurrentResultCaseStudyIndex(0);
      setFullName('');
    } catch (err) {
      console.error('Error during page refresh cleanup:', err);
    }
  };

  // useEffect to detect page refresh and perform cleanup
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const navigationEntries = window.performance.getEntriesByType('navigation');
      if (navigationEntries.length > 0 && navigationEntries[0].type === 'reload') {
        // The page was reloaded
        handlePageRefresh();
      }
    }
  }, []);

  // Current Case Study
  const currentCaseStudy = caseStudies[currentCaseStudyIndex];

  // Determine if current question is the last question
  const isLastQuestion =
    currentQuestionIndex === currentCaseStudy?.questions.length - 1;
  const isLastCaseStudy = currentCaseStudyIndex === caseStudies.length - 1;

  // Example options for dropdowns based on userType
  const clinicalDepartments = ['Operating Room'];

  const nonClinicalDepartments = [
    'Communication',
    // Add other non-clinical departments if needed
  ];

  const clinicalRoles = [
    'Surgeon',
    'Nurse',
    'Circulator Nurse',
    'Surgical Technologist',
    // Add other clinical roles if needed
  ];

  const nonClinicalRoles = [
    'Administrator',
    'Accountant',
    'HR Manager',
    'Maintenance Staff',
    'IT Support',
    // Add other non-clinical roles if needed
  ];

  const specializations = [
    'Orthopedic',
    'Neurosurgery',
    'Vascular Surgery',
    'Transplant Surgery',
    'Oncological Surgery',
    'Gynecological Surgery',
    'ENT Surgery',
    'Scrub Nurse',
    'Circulating Nurse',
    'RN First Assistant',
    'Preoperative Nurse',
    'Post-Anesthesia Care Unit Nurse',
    'Perioperative Nurse Educator',
    'Urology Surgery',
    // Add other specializations if needed
  ];

  // Generate random 6-digit user ID on component mount
  useEffect(() => {
    const randomID = Math.floor(100000 + Math.random() * 900000).toString();
    setUserID(randomID);
  }, []);

  // Determine which departments and roles to use based on userType
  let departmentsToUse = [];
  let rolesToUse = [];

  if (userType === 'clinical') {
    departmentsToUse = clinicalDepartments;
    rolesToUse = clinicalRoles;
  } else if (userType === 'non-clinical') {
    departmentsToUse = nonClinicalDepartments;
    rolesToUse = nonClinicalRoles;
  }

  // Helper function to get the full label of an option
  const getOptionLabel = (caseIndex, questionIndex, optionKey) => {
    const option = caseStudies[caseIndex]?.questions[questionIndex]?.options.find(
      (opt) => opt.key === optionKey
    );
    return option ? `${option.key}. ${option.label}` : 'No Answer';
  };


   // Google Translate Initialization
   useEffect(() => {
    window.googleTranslateElementInit = () => {
      new window.google.translate.TranslateElement(
        {
          pageLanguage: 'en', // Set the base language to English
          autoDisplay: false, // Prevent automatic translation based on browser settings
          includedLanguages: 'en,es', // Only include English and Spanish
        },
        'google_translate_element'
      );

      // Force the language to English after initialization
      setTimeout(() => {
        const select = document.querySelector('.goog-te-combo');
        if (select) {
          select.value = 'en';
          select.dispatchEvent(new Event('change'));
        }
      }, 1000); // Delay to ensure the translate element has loaded
    };
  }, []);




  return (
    <>
      {/* Head section to include Google Translate CSS and set the page title */}
      <Head>
        <title>Medical Safety Assessment</title>
        {/* Google Translate CSS */}
        <link
          rel="stylesheet"
          type="text/css"
          href="https://www.gstatic.com/_/translate_http/_/ss/k=translate_http.tr.26tY-h6gH9w.L.W.O/am=CAM/d=0/rs=AN8SPfpIXxhebB2A47D9J-MACsXmFF6Vew/m=el_main_css"
        />
      </Head>

     
      {/* Load the Google Translate script after the callback is defined */}
      <Script
        src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
        strategy="afterInteractive"
      />

      <div className="container">
        <div className="content-wrapper">
          {/* Image and Assessment Complete Form Container */}
          <div className="image-container">
            {/* Header Image */}
            <img src="/Picture1.jpg" alt="Medical Assessment" className="header-image" />

            {/* Assessment Completion Form */}
            {assessmentComplete && (
              <div className="assessment-complete">
                {/* Result Container with Score and Message */}
                <div className="result-container">
                  {/* Score Circle */}
                  <div className="score-circle">
                    <span>{totalScore}%</span>
                  </div>
                </div>

                {/* Case Study Results */}
                {resultDetails.map((caseDetail) => (
                  <div key={`case-${caseDetail.caseStudyNumber}`} className="case-detail">
                    {/* Header for Each Case Study */}
                    <h3>{`Case Study ${caseDetail.caseStudyNumber}`}</h3>

                    {/* Display Case Study Content */}
                    <p className="case-study-text">{caseDetail.caseStudyText}</p>

                    {caseDetail.questions.map((q) => (
                      <div key={`question-${q.questionNumber}`} className="question-summary">
                        {/* Header with Question Number and Status Icon */}
                        <div className="question-header-summary">
                          <h4>{`Question ${q.questionNumber}`}</h4>
                          <span>
                            {q.isCorrect ? '✅' : '❌'}
                          </span>
                        </div>

                        {/* Question Text */}
                        <p className="question-text">{q.questionText}</p>

                        {/* Your Answer */}
                        <h5>Your Answer:</h5>
                        <p className="user-answer">
                          {q.selectedAnswer !== 'No Answer'
                            ? getOptionLabel(
                                caseDetail.caseStudyNumber - 1,
                                q.questionNumber - 1,
                                q.selectedAnswer
                              )
                            : 'No Answer'}
                        </p>

                        {/* Correct Answer */}
                        <h5>Correct Answer:</h5>
                        <p className="correct-answer">
                          {getOptionLabel(
                            caseDetail.caseStudyNumber - 1,
                            q.questionNumber - 1,
                            aiResponse[caseDetail.caseStudyNumber - 1].questions[q.questionNumber - 1].correctAnswer.split(')')[0].trim()
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Result Buttons */}
                <div className="result-buttons">
                  <button
                    className="main-button"
                    onClick={handleBackToMainPage}
                    disabled={isLoading}
                  >
                    Return to Main
                  </button>
                  <button
                    className="print-button"
                    onClick={handlePrint}
                    disabled={isLoading}
                  >
                    🖨️ Print Assessment Report
                  </button>
                </div>
              </div>
            )}
          </div>

         
          {/* Enhanced Form Container */}
          {showSafetyStatement && (
            <div className="form-container">
              {/* User ID Display */}
              <div className="form-field user-id">
                <label>User ID:</label>
                <span>{userID}</span>
              </div>

              {/* Full Name Input */}
              <div className="form-field">
                <label htmlFor="fullName">Full Name:</label>
                <input
                  type="text"
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                />
              </div>

              {/* Professional Information */}
              <div className="professional-info">
                <h2>Professional Information</h2>

                <div className="form-item">
                  <label htmlFor="user-type-select">User Type</label>
                  <select
                    id="user-type-select"
                    value={userType}
                    onChange={(e) => {
                      setUserType(e.target.value);
                      setDepartment(''); // Reset department
                      setRole(''); // Reset role
                      setSpecialization(''); // Reset specialization
                      if (error) setError(''); // Clear error if any
                    }}
                  >
                    <option value="">Select</option>
                    <option value="clinical">Clinical</option>
                    <option value="non-clinical">Non-Clinical</option>
                  </select>
                </div>

                <div className="form-item">
                  <label htmlFor="department-select">Department</label>
                  <select
                    id="department-select"
                    value={department}
                    onChange={(e) => {
                      setDepartment(e.target.value);
                      if (error) setError(''); // Clear error if any
                    }}
                    disabled={!userType}
                  >
                    <option value="">Select Department</option>
                    {departmentsToUse.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-item">
                  <label htmlFor="role-select">Role</label>
                  <select
                    id="role-select"
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      if (error) setError(''); // Clear error if any
                    }}
                    disabled={!userType}
                  >
                    <option value="">Select Role</option>
                    {rolesToUse.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Specialization Select - only show if userType is 'clinical' */}
                {userType === 'clinical' && (
                  <div className="form-item">
                    <label htmlFor="specialization-select">Specialization</label>
                    <select
                      id="specialization-select"
                      value={specialization}
                      onChange={(e) => {
                        setSpecialization(e.target.value);
                        if (error) setError(''); // Clear error if any
                      }}
                    >
                      <option value="">Select Specialization</option>
                      {specializations.map((spec) => (
                        <option key={spec} value={spec}>
                          {spec}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Take Assessment Button */}
          <div className="button-container">
            {showSafetyStatement && !showCaseStudies && !assessmentComplete && (
              <button
                type="button"
                className="assessment-button"
                onClick={handleTakeAssessment}
                disabled={isLoading}
              >
                {isLoading
                  ? 'Starting your assessment, please wait...'
                  : 'Take Assessment'}
              </button>
            )}
          </div>

          {/* Error Alert */}
          {error && <div className="error-alert">{error}</div>}

          {/* Case Studies Page */}
          {showCaseStudies && Array.isArray(caseStudies) && caseStudies.length > 0 && (
            <div className="case-studies">
              {/* Current Case Study */}
              <div className="case-study" key={currentCaseStudyIndex}>
                {/* Case Study Image */}
                {caseStudies[currentCaseStudyIndex].imageUrl && (
                  <div className="case-study-image">
                    <img
                      src={caseStudies[currentCaseStudyIndex].imageUrl}
                      alt={`Case Study ${currentCaseStudyIndex + 1} Image`}
                      className="header-image"
                    />
                  </div>
                )}

                {/* Case Study Title and Audio Button */}
                <div className="case-study-header">
                  <h3>{`Case Study ${currentCaseStudyIndex + 1}`}</h3>
                  <button
                    type="button"
                    className="audio-button"
                    onClick={fetchAudio}
                    disabled={isAudioLoading}
                  >
                    {isAudioLoading ? (
                      <span>Loading...</span>
                    ) : isAudioPlaying ? (
                      <>
                        <span className="icon-volume-up"></span>
                        Pause
                      </>
                    ) : (
                      <>
                        <span className="icon-volume-off"></span>
                        Listen
                      </>
                    )}
                  </button>
                </div>

                {/* Audio Element */}
                <audio ref={audioRef} />

                {/* Audio Error Alert */}
                {audioError && <div className="audio-error">{audioError}</div>}

                {/* Case Study Scenario */}
                <p className="case-study-scenario">
                  {caseStudies[currentCaseStudyIndex].scenario}
                </p>

                {/* Case Study Questions */}
                {caseStudies[currentCaseStudyIndex].questions &&
                caseStudies[currentCaseStudyIndex].questions.length > 0 ? (
                  <div className="question-section">
                    {/* Header for the Question */}
                    <h4 className="question-header">
                      {`Question ${currentQuestionIndex + 1}: ${
                        caseStudies[currentCaseStudyIndex].questions[currentQuestionIndex].question
                      }`}
                    </h4>

                    <div className="options-group">
                      {caseStudies[currentCaseStudyIndex].questions[currentQuestionIndex].options.map(
                        (option) => {
                          const key = `${currentCaseStudyIndex}-${currentQuestionIndex}`;
                          const currentAttempts = attempts[key] || 0;
                          const feedbackMessage =
                            feedbackMessages[currentCaseStudyIndex]?.[currentQuestionIndex]
                              ?.message || '';
                          const isCorrect = feedbackMessage === 'Correct Answer';
                          const maxAttemptsReached = currentAttempts >= 3 || isCorrect;

                          return (
                            <div className="option-item" key={option.key}>
                              <label>
                                <input
                                  type="radio"
                                  name={`question-${currentCaseStudyIndex}-${currentQuestionIndex}`}
                                  value={option.key}
                                  onChange={(e) =>
                                    handleAnswerChange(
                                      currentCaseStudyIndex,
                                      currentQuestionIndex,
                                      e.target.value
                                    )
                                  }
                                  disabled={maxAttemptsReached}
                                  checked={
                                    selectedAnswers[currentCaseStudyIndex]?.[currentQuestionIndex] ===
                                    option.key
                                  }
                                />
                                <span>
                                  <strong>{`${option.key}.`}</strong> {option.label}
                                </span>
                              </label>
                            </div>
                          );
                        }
                      )}
                    </div>

                    {/* Display feedback message */}
                    {feedbackMessages[currentCaseStudyIndex]?.[currentQuestionIndex] && (
                      <div className="feedback-section">
                        <div
                          className={`feedback-message ${
                            feedbackMessages[currentCaseStudyIndex][currentQuestionIndex]
                              .message === 'Correct Answer'
                              ? 'success'
                              : 'info'
                          }`}
                        >
                          {feedbackMessages[currentCaseStudyIndex][currentQuestionIndex].message}
                        </div>
                        {feedbackMessages[currentCaseStudyIndex][currentQuestionIndex].hint && (
                          <div className="hint">
                            <span className="icon-hint"></span>
                            <span>
                              <strong>Hint:</strong>{' '}
                              {feedbackMessages[currentCaseStudyIndex][currentQuestionIndex].hint}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="no-questions">No questions available for this case study.</p>
                )}

                {/* Navigation Button */}
                {caseStudies[currentCaseStudyIndex].questions &&
                  caseStudies[currentCaseStudyIndex].questions.length > 0 && (
                    <div className="navigation-buttons">
                      <button
                        type="button"
                        className="next-button"
                        onClick={handleNext}
                      >
                        {isLastQuestion && isLastCaseStudy ? 'Submit' : 'Next'}
                      </button>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Handle Empty Case Studies */}
          {showCaseStudies && Array.isArray(caseStudies) && caseStudies.length === 0 && (
            <div className="no-case-studies">
              No case studies available at the moment. Please try again later.
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="footer">
          <p>
            © CoachCare.ai | Email: rizwanshaikh2200@gmail.com | Phone:{' '}
            (404) 980-4465
          </p>
        </footer>
      </div>
    </>
  );
}