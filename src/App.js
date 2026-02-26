import React, { useState, useEffect } from "react";

import "./App.css";

// Firebase imports - for database and authentication
import { database, auth } from "./firebase";
import {
  ref,
  push,
  onValue,
  remove,
  update,
  set,
  get,
} from "firebase/database";
import { onAuthStateChanged, signOut, deleteUser } from "firebase/auth";

// Our custom components
import Auth from "./Auth"; // Login/signup page
import Chat from "./Chat"; // AI chat assistant
import {
  requestNotificationPermission,
  showNotification,
  scheduleNotification,
} from "./Notifications";

// Voice Assistant Function
// This function converts text to speech using the Web Speech API
// Built into all modern browsers - no libraries needed!
const speak = (text, isEnabled) => {
  // If voice is disabled, don't speak
  if (!isEnabled) return;

  // Check if browser supports speech synthesis
  if (!window.speechSynthesis) {
    console.warn("Speech synthesis not supported in this browser");
    return;
  }

  // Cancel any currently speaking text to avoid overlapping
  window.speechSynthesis.cancel();

  // Create a new speech utterance (the text to be spoken)
  const utterance = new SpeechSynthesisUtterance(text);

  // Configure speech properties
  utterance.rate = 1.0; // Speed: 1.0 = normal, 0.5 = slow, 2.0 = fast
  utterance.pitch = 1.0; // Pitch: 1.0 = normal, 0.5 = low, 2.0 = high
  utterance.volume = 1.0; // Volume: 0.0 to 1.0 (max)
  utterance.lang = "en-GB"; // British English accent

  // Error handling
  utterance.onerror = (event) => {
    console.error("Speech synthesis error:", event);
  };

  // Speak the text!
  window.speechSynthesis.speak(utterance);
};

// Function for Measurements page
function Measurements({ user, setActivePage }) {
  const [activeTab, setActiveTab] = useState("log");
  const [measurements, setMeasurements] = useState({
    systolic: "",
    diastolic: "",
    heartRate: "",
    weight: "",
    bloodSugarBefore: "",
    bloodSugarAfter: "",
    temperature: "",
  });

  const [history, setHistory] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [reminderType, setReminderType] = useState("measurement");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderTime, setReminderTime] = useState("08:00");
  const [reminderDays, setReminderDays] = useState([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]);
  const [reminderNotes, setReminderNotes] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const userName = user.email.split("@")[0];

  // loads measurement history from last 7 days
  // sorts by date and reverses to show oldest first
  useEffect(() => {
    if (!user) return;
    const historyRef = ref(database, `users/${user.uid}/measurements`);
    onValue(historyRef, (snapshot) => {
      if (snapshot.val()) {
        const data = Object.entries(snapshot.val()).map(([date, values]) => ({
          date,
          ...values,
        }));
        const last7Days = data
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 7)
          .reverse();
        setHistory(last7Days);
      } else {
        setHistory([]);
      }
    });
  }, [user]);

  // loads all reminders from firebase
  // converts object to array for easier mapping
  useEffect(() => {
    if (!user) return;
    const remindersRef = ref(database, `users/${user.uid}/reminders`);
    onValue(remindersRef, (snapshot) => {
      if (snapshot.val()) {
        const data = Object.entries(snapshot.val()).map(([id, reminder]) => ({
          id,
          ...reminder,
        }));
        setReminders(data);
      } else {
        setReminders([]);
      }
    });
  }, [user]);

}

function Dashboard({ user, medications, setActivePage }) {
  // fitness - stores today's fitness data (steps, water, activities)
  const [fitness, setFitness] = useState(null);

  // Track which medications have been taken today
  const [takenMeds, setTakenMeds] = useState({});

  // Hover state for donut chart tooltip 
  const [hoveredSegment, setHoveredSegment] = useState(null); // 'taken', 'pending', or null

  // Date & Time Formatting
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // User Data Calculations
  const userName = user.email.split("@")[0];
  const steps = fitness?.steps || 0;
  const water = fitness?.water || 0;
  const waterMl = water * 250;
  const waterGoal = 2000;
  const waterPct = Math.min(100, Math.round((waterMl / waterGoal) * 100));
  const activities = fitness?.activities || [];
  const totalMins = activities.reduce(
    (sum, activity) => sum + (activity.duration || 0),
    0,
  );
  const calories = Math.round(totalMins * 5.5);

  // Calculate real medication adherence statistics

  // Get today's date
  const today = new Date().toISOString().split("T")[0];

  // Count how many medications have been marked as taken
  const takenCount = Object.values(takenMeds).filter(Boolean).length;

  // Total number of medications
  const totalMeds = medications.length;

  // Count pending (not taken yet)
  const pendingCount = totalMeds - takenCount;

  // Calculate percentages for the donut chart
  // If no medications, show 0% taken
  const takenPercentage = totalMeds > 0 ? (takenCount / totalMeds) * 100 : 0;
  const pendingPercentage =
    totalMeds > 0 ? (pendingCount / totalMeds) * 100 : 100;

  // ─── Load Fitness Data Effect ───────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;

    const today = new Date().toISOString().split("T")[0];
    const fitnessRef = ref(database, `users/${user.uid}/fitness/${today}`);

    onValue(fitnessRef, (snapshot) => {
      setFitness(snapshot.val());
    });
  }, [user]);

  // Load which medications have been marked as taken today
  useEffect(() => {
    if (!user) return;

    const today = new Date().toISOString().split("T")[0];

    // Reference to today's taken medications
    const takenRef = ref(database, `users/${user.uid}/takenMeds/${today}`);

    const unsubscribe = onValue(takenRef, (snapshot) => {
      console.log("Firebase data received:", snapshot.val());

      if (snapshot.val()) {
        setTakenMeds(snapshot.val());
        console.log("Loaded takenMeds:", snapshot.val());
      } else {
        setTakenMeds({});
        console.log("No takenMeds data for today - set empty object");
      }
    });

    return () => {
      console.log("Cleaning up listener");
      unsubscribe();
    };
  }, [user, today]);

}

function Medications({
  user,
  medications,
  setActivePage,
  voiceEnabled,
  setVoiceEnabled,
}) {
  // track current Time
  const [currentTime, setCurrentTime] = useState(new Date());

  // Modal visibility - controls whether the "Add Medication" modal is shown
  const [showModal, setShowModal] = useState(false);

  // Form fields for adding a new medication
  const [medName, setMedName] = useState(""); // e.g. "Aspirin"
  const [medDosage, setMedDosage] = useState(""); // e.g. "100mg"
  const [medFreq, setMedFreq] = useState("Once daily"); // How often to take it
  const [medTimeSlot, setMedTimeSlot] = useState("Morning"); // Morning/Afternoon/Evening/Night
  const [medTime, setMedTime] = useState("08:00"); // Specific time
  const [medNotes, setMedNotes] = useState(""); // Additional instructions

  // Track which medications have been marked as taken today
  // Structure: { medicationId: true/false }
  const [takenMeds, setTakenMeds] = useState({});

  // ID of medication currently being edited (null if none)
  const [editingId, setEditingId] = useState(null);

  // Get today's date for tracking which meds were taken
  const today = new Date().toISOString().split("T")[0];

  // Time Display Helper Function

  // Convert 24-hour time (e.g. "14:30") to 12-hour format (e.g. "2:30 PM")
  const timeDisplay = (time) => {
    // return empty if no time provided
    if (!time) return "";

    // Split time into hours and minutes
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);

    // Convert to 12-hour format
    return `${hour > 12 ? hour - 12 : hour || 12}:${minutes} ${hour >= 12 ? "PM" : "AM"}`;
  };

}

export default function App() {

  // user - the currently logged-in user (null if not logged in)
  const [user, setUser] = useState(null);

  // checking authentication status
  const [loading, setLoading] = useState(true);

  // array of all medications for the current user
  const [medications, setMedications] = useState([]);

  const [reminders, setReminders] = useState([]);

  // chooses which page to show (dashboard, medications, ...)
  const [activePage, setActivePage] = useState("dashboard");

  // controls whether voice announcements are on/off
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Large text mode for accessibility
  const [largeTextEnabled, setLargeTextEnabled] = useState(false);

  // High contrast mode for accessibility
  const [highContrastEnabled, setHighContrastEnabled] = useState(false);

  // Authentication Listener Effect

  // Listen for authentication state changes (login/logout)
  // This effect runs once when the app starts
  useEffect(() => {
    // onAuthStateChanged listens for login/logout events
    // It returns an unsubscribe function to clean up the listener
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Update user state with current logged-in user (or null)
      setUser(currentUser);

      // We're done checking auth status
      setLoading(false);
    });

    // Cleanup function - stops listening when component unmounts
    return () => unsubscribe();
  }, []); // Empty dependency array = run once on mount

  // Load Medications Effect

  // Load all medications for the current user
  useEffect(() => {
    // If no user is logged in, clear medications
    if (!user) {
      setMedications([]);
      return;
    }

    // Create reference to user's medications in Firebase
    const medsRef = ref(database, `users/${user.uid}/medications`);

    // Listen for changes to medications in real-time
    onValue(medsRef, (snapshot) => {
      const data = snapshot.val();

      if (data) {
        // Convert Firebase object to array
        // Firebase stores data as: { id1: {name, time}, id2: {name, time} }
        // We convert to: [{ id: id1, name, time }, { id: id2, name, time }]
        const medsArray = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));

        setMedications(medsArray);
      } else {
        // No medications found
        setMedications([]);
      }
    });
  }, [user]); // Re-run when user changes (login/logout)
}
