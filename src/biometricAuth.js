// BIOMETRIC AUTHENTICATION SERVICE

import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "capacitor-native-biometric";

const SERVER_ID = "com.medfithealth.app";

// Check if running on native platform
export const isNativePlatform = () => {
  return Capacitor.isNativePlatform();
};

// Check if biometric authentication is available
export const isBiometricAvailable = async () => {
  if (!isNativePlatform()) {
    return { isAvailable: false, biometryType: "none" };
  }

  try {
    const result = await NativeBiometric.isAvailable();

    let biometryTypeName = "Biometric";
    if (result.biometryType === 1) biometryTypeName = "Touch ID";
    else if (result.biometryType === 2) biometryTypeName = "Face ID";
    else if (result.biometryType === 3) biometryTypeName = "Fingerprint";

    return {
      isAvailable: result.isAvailable,
      biometryType: biometryTypeName,
    };
  } catch (error) {
    console.error("Biometric check error:", error);
    return { isAvailable: false, biometryType: "none" };
  }
};

// Save credentials securely
export const saveCredentials = async (email, password) => {
  if (!isNativePlatform()) return false;

  try {
    await NativeBiometric.setCredentials({
      username: email,
      password: password,
      server: SERVER_ID,
    });
    return true;
  } catch (error) {
    console.error("Save credentials error:", error);
    return false;
  }
};

// Check if credentials exist
export const hasStoredCredentials = async () => {
  if (!isNativePlatform()) return false;

  try {
    const credentials = await NativeBiometric.getCredentials({
      server: SERVER_ID,
    });
    return !!(credentials?.username && credentials?.password);
  } catch (error) {
    return false;
  }
};

// Authenticate with biometric and get credentials
export const authenticateWithBiometric = async (
  reason = "Log in to MedFit Health",
) => {
  if (!isNativePlatform()) {
    return { success: false, error: "Not on native platform" };
  }

  try {
    await NativeBiometric.verifyIdentity({
      reason: reason,
      title: "MedFit Health",
      subtitle: "Log in with biometrics",
      useFallback: true,
      fallbackTitle: "Use Passcode",
    });

    const credentials = await NativeBiometric.getCredentials({
      server: SERVER_ID,
    });

    if (credentials?.username && credentials?.password) {
      return {
        success: true,
        email: credentials.username,
        password: credentials.password,
      };
    }
    return { success: false, error: "No credentials found" };
  } catch (error) {
    console.error("Biometric auth error:", error);
    return { success: false, error: error.message || "Authentication failed" };
  }
};

// Delete stored credentials
export const deleteCredentials = async () => {
  if (!isNativePlatform()) return false;

  try {
    await NativeBiometric.deleteCredentials({ server: SERVER_ID });
    return true;
  } catch (error) {
    console.error("Delete credentials error:", error);
    return false;
  }
};
