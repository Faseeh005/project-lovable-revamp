// Custom React hook that pulls live health data from the device.
// On Android this talks to Google Health Connect, on iOS it uses Apple HealthKit.
// Both are accessed through the same "capacitor-health" npm package which handles
// the platform differences under the hood, so the JS code here stays the same.
//
// Running in a browser (localhost) Health data isn't available there, so all
// values just default to zero and the Connect button stays hidden.

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

// returns true when running as an actual installed app on a device,
// false when running in a browser during development
const isNative = () => Capacitor.isNativePlatform();

// Builds a placeholder array for the weekly steps chart.
// Goes back 7 days from today and sets each day's step count to 0.
// This is shown before the user connects Health Connect, so the chart
// renders with empty bars rather than crashing.
const emptyWeek = () => {
  const now = new Date();
  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(now);
    // idx 0 = 6 days ago, idx 6 = today
    d.setDate(d.getDate() - (6 - idx));
    return {
      date: d.toISOString().split("T")[0], // "2026-03-06"
      dayName: d.toLocaleDateString("en-GB", { weekday: "short" }), // "Thu"
      steps: 0,
    };
  });
};

// Default shape for today's health snapshot.
// isFromHealthKit: false tells the dashboard to use manually logged data
// instead until the user actually connects.
const defaultHealthData = () => ({
  steps: 0,
  calories: 0,
  activeCalories: 0,
  distance: 0, // km
  flightsClimbed: 0,
  heartRate: null, // null means no reading available
  isFromHealthKit: false,
});

// Plugin loader
// We load capacitor-health lazily (on first use) rather than at the top of the
// file. That way if the plugin isn't installed it won't crash the whole app —
// it just logs a warning and health data stays at zero.
let _health = null;

const getHealth = async () => {
  // Already loaded, hand it back immediately
  if (_health) return _health;

  try {
    const mod = await import("capacitor-health");
    // Different versions of the package export the plugin slightly differently,
    // so we try a few names until one works
    _health = mod.Health || mod.CapacitorHealthkit || mod.default || null;

    if (_health) {
      console.log("[health] capacitor-health plugin loaded successfully");
    } else {
      console.warn(
        "[health] capacitor-health module imported but no usable export found",
      );
    }
    return _health;
  } catch (err) {
    // Plugin isn't installed or can't be loaded — not a crash, just no health data
    console.warn(
      "[health] Could not load capacitor-health plugin:",
      err.message,
    );
    return null;
  }
};

// Data helpers

// Health data comes back as an array of "samples" — small chunks recorded over
// time. We need to add them all up to get a total for the day.
// The field might be called "value" or "quantity" depending on the plugin version.
const sumSamples = (samples) =>
  (samples || []).reduce(
    (total, sample) =>
      total + (parseFloat(sample.value ?? sample.quantity) || 0),
    0,
  );

// Promise.allSettled() is used so that if one metric fails (e.g. no heart rate
// permission), the others still come through. This helper pulls the sample array
// out of a settled result safely.
const extractSamples = (settledResult) => {
  if (settledResult.status !== "fulfilled" || !settledResult.value) return [];
  const response = settledResult.value;
  // Again, field name varies by plugin version
  return response.resultData || response.data || response.samples || [];
};

// Main hook

export const useHealthKit = () => {
  const [isAvailable, setIsAvailable] = useState(false); // Is Health Connect installed?
  const [isAuthorized, setIsAuthorized] = useState(false); // Has user granted permission?
  const [isLoading, setIsLoading] = useState(true); // Fetching data right now?
  const [error, setError] = useState(null); // Last error message if any
  const [healthData, setHealthData] = useState(defaultHealthData()); // Today's metrics
  const [weeklySteps, setWeeklySteps] = useState(emptyWeek()); // 7-day step chart

  // Fetch today's health summary
  // Grabs steps, calories, distance, and heart rate all at once for today.
  // useCallback stops this function from being recreated on every render,
  // which matters because it's referenced in the auto-refresh interval.
  const fetchTodayData = useCallback(async () => {
    const health = await getHealth();
    if (!health) return;

    const now = new Date();
    // startISO = midnight today, endISO = right now
    const startISO = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();
    const endISO = now.toISOString();

    // The plugin has two slightly different APIs depending on version —
    // queryHKitSampleType is the older iOS-style API, query is the newer one.
    // This wrapper tries the right one automatically.
    const query = (sampleName) =>
      health.queryHKitSampleType
        ? health.queryHKitSampleType({
            sampleName,
            startDate: startISO,
            endDate: endISO,
            limit: 0,
          })
        : health.query?.({
            startDate: startISO,
            endDate: endISO,
            dataType: sampleName,
          });

    // Fire all four queries at the same time rather than waiting for each one
    // in sequence — much faster, and if one fails the others still succeed
    const [stepsRes, calRes, distRes, hrRes] = await Promise.allSettled([
      query("stepCount"),
      query("activeEnergyBurned"),
      query("distanceWalkingRunning"),
      // Heart rate: limit: 1 because we only want the most recent reading
      health.queryHKitSampleType
        ? health.queryHKitSampleType({
            sampleName: "heartRate",
            startDate: startISO,
            endDate: endISO,
            limit: 1,
          })
        : health.query?.({
            startDate: startISO,
            endDate: endISO,
            dataType: "heartRate",
          }),
    ]);

    // Add up all step samples for the day
    const steps = Math.round(sumSamples(extractSamples(stepsRes)));
    // Add up all active calorie samples (these are calories from exercise, not resting)
    const activeCalories = Math.round(sumSamples(extractSamples(calRes)));
    // Distance comes back in metres, convert to km for display
    const distanceM = sumSamples(extractSamples(distRes));
    // Heart rate: grab the last sample in the array (most recent)
    const hrSamples = extractSamples(hrRes);
    const heartRate =
      hrSamples.length > 0
        ? Math.round(
            parseFloat(
              hrSamples[hrSamples.length - 1].value ??
                hrSamples[hrSamples.length - 1].quantity,
            ),
          )
        : null;

    console.log(
      "[health] Today — steps:",
      steps,
      "| cal:",
      activeCalories,
      "| dist:",
      distanceM + "m",
    );

    setHealthData({
      steps,
      calories: activeCalories, // used for the main calories display
      activeCalories,
      distance: Math.round((distanceM / 1000) * 100) / 100, // round to 2dp
      flightsClimbed: 0, // not supported on Android Health Connect
      heartRate,
      isFromHealthKit: true, // tells the dashboard to use this data over manual logs
    });
  }, []);

  // Fetch 7-day step history
  // Loops through the past 7 days and queries step count for each one.
  // The results populate the bar chart on the dashboard.
  const fetchWeeklySteps = useCallback(async () => {
    const health = await getHealth();
    if (!health) return;

    const now = new Date();
    const week = [];

    // i = 6 means "6 days ago", i = 0 means "today"
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);

      // Start = midnight, end = 11:59pm on that day
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const end = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        23,
        59,
        59,
      );

      try {
        let res;
        if (health.queryHKitSampleType) {
          res = await health.queryHKitSampleType({
            sampleName: "stepCount",
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            limit: 0,
          });
        } else {
          res = await health.query?.({
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            dataType: "steps",
          });
        }

        const samples = res?.resultData || res?.data || res?.samples || [];
        const daySteps = Math.round(sumSamples(samples));

        week.push({
          date: start.toISOString().split("T")[0],
          dayName: start.toLocaleDateString("en-GB", { weekday: "short" }),
          steps: daySteps,
        });
      } catch {
        // If a single day fails, push 0 rather than bailing on the whole week
        week.push({
          date: start.toISOString().split("T")[0],
          dayName: start.toLocaleDateString("en-GB", { weekday: "short" }),
          steps: 0,
        });
      }
    }

    console.log(
      "[health] Weekly steps:",
      week.map((d) => d.steps),
    );
    setWeeklySteps(week);
  }, []);

  // Request permission from the user
  // Called when the user taps "Connect" on the dashboard.
  // Opens the Health Connect permissions dialog on Android (or HealthKit on iOS).
  // After the user grants access, we immediately fetch their data.
  const requestAuthorization = useCallback(async () => {
    const health = await getHealth();
    if (!health) return false;

    try {
      const dataTypes = [
        "stepCount",
        "activeEnergyBurned",
        "distanceWalkingRunning",
        "heartRate",
      ];

      // Again, handle both API versions
      if (health.requestAuthorization) {
        await health.requestAuthorization({
          all: dataTypes,
          read: dataTypes,
          write: [],
        });
      } else if (health.requestPermissions) {
        await health.requestPermissions({ read: dataTypes, write: [] });
      }

      setIsAuthorized(true);

      // Kick off both fetches immediately so the dashboard updates straight away
      await Promise.all([fetchTodayData(), fetchWeeklySteps()]);
      return true;
    } catch (err) {
      console.error("[health] Permission request failed:", err);
      setError(err.message);
      return false;
    }
  }, [fetchTodayData, fetchWeeklySteps]);

  // Manual refresh
  // Triggered when the user taps the refresh button on the dashboard.
  const refreshHealthData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchTodayData(), fetchWeeklySteps()]);
    setIsLoading(false);
  }, [fetchTodayData, fetchWeeklySteps]);

  // Initialise on mount
  // Runs once when the app loads. Checks if Health Connect is available,
  // then checks if we already have permission from a previous session.
  // If we do, load the data straight away without showing the Connect button.
  useEffect(() => {
    // No point trying any of this in the browser
    if (!isNative()) {
      setIsLoading(false);
      return;
    }

    const init = async () => {
      try {
        const health = await getHealth();
        if (!health) {
          setIsLoading(false);
          return;
        }

        // Check if the device supports Health Connect / HealthKit at all.
        // On very old Android devices or emulators Health Connect might not be installed.
        let available = true; // assume yes unless the plugin says otherwise
        try {
          if (health.isAvailable) {
            const res = await health.isAvailable();
            available = res?.available === true || res === true;
          }
        } catch {
          // isAvailable threw — treat as available and let later calls fail if needed
        }

        setIsAvailable(available);

        if (!available) {
          console.log("[health] Health Connect not available on this device");
          setIsLoading(false);
          return;
        }

        // Check if the user already granted permission during a previous session.
        // This is a silent check — no dialog shown to the user.
        let authorized = false;
        try {
          if (health.checkAuthorizationStatus) {
            const status = await health.checkAuthorizationStatus({
              read: ["stepCount", "activeEnergyBurned"],
            });
            authorized = status?.authorized === true || status === "authorized";
          }
        } catch {
          // Not all plugin versions support this method — that's fine,
          // the user will just see the Connect button and tap it manually
        }

        if (authorized) {
          setIsAuthorized(true);
          // Load both today's data and the weekly chart simultaneously
          await Promise.all([fetchTodayData(), fetchWeeklySteps()]);
        }

        setIsLoading(false);
      } catch (err) {
        console.error("[health] Initialisation failed:", err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    init();

    // Auto-refresh every 5 minutes so the step count stays up to date
    // while the user keeps the app open
    const refreshInterval = setInterval(
      () => {
        fetchTodayData();
        fetchWeeklySteps();
      },
      5 * 60 * 1000,
    );

    // Cleanup: cancel the interval when the component unmounts
    return () => clearInterval(refreshInterval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Return everything the dashboard needs
  return {
    isAvailable, // whether Health Connect is present on device
    isAuthorized, // whether user has granted permission
    isLoading, // true while fetching — dashboard shows spinner
    error, // error message or null
    healthData, // today's steps, calories, distance, heart rate
    weeklySteps, // array of 7 days for the bar chart
    requestAuthorization, // call this when user taps Connect
    refreshHealthData, // call this when user taps Refresh
  };
};

export default useHealthKit;
