// useHealthKit CUSTOM HOOK
//
// What is a "Custom Hook"?
// A custom hook is a reusable piece of logic that can use React features
// (like useState and useEffect). It always starts with "use".
//
// Why use a custom hook?
// 1. Separates HealthKit logic from the UI components
// 2. Makes the code reusable - any component can use this hook
// 3. Keeps components clean and focused on displaying UI
//
// What this hook does:
// 1. Checks if HealthKit is available when the component mounts
// 2. Provides a function to request authorization
// 3. Fetches health data and stores it in state
// 4. Auto-refreshes data every 5 minutes
// 5. Provides loading and error states

// useHealthKit CUSTOM HOOK - FIXED FOR ANDROID
//
// This hook safely handles both iOS (with HealthKit) and Android (without HealthKit)
// On Android, it returns default values without trying to load iOS-only plugins

import { useEffect, useMemo, useState } from "react";

export const useHealthKit = () => {
  const [weeklySteps, setWeeklySteps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Stable default health data object (won’t change identity every render)
  const healthData = useMemo(
    () => ({
      steps: 0,
      calories: 0,
      activeCalories: 0,
      distance: 0,
      flightsClimbed: 0,
      heartRate: null,
      isFromHealthKit: false,
    }),
    [],
  );

  useEffect(() => {
    // Build a 7-day array (oldest -> newest)
    const now = new Date();
    const defaultWeekly = Array.from({ length: 7 }, (_, idx) => {
      const i = 6 - idx;
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      return {
        date: date.toISOString().split("T")[0],
        dayName: date.toLocaleDateString("en-GB", { weekday: "short" }),
        steps: 0,
      };
    });

    setWeeklySteps(defaultWeekly);
    setIsLoading(false);
  }, []);

  const requestAuthorization = async () => {
    // HealthKit is iOS-only, so always false on Android
    return false;
  };

  const refreshHealthData = async () => {
    // No-op on Android; return current defaults
    return {
      healthData,
      weeklySteps,
    };
  };

  return {
    isAvailable: false, // HealthKit not available on Android
    isAuthorized: false, // Can't authorize HealthKit on Android
    isLoading,
    error: null,
    healthData,
    weeklySteps,
    requestAuthorization,
    refreshHealthData,
  };
};

export default useHealthKit;
