import { useState } from "react"
import { clearAuthSession, getAuthUser } from "./lib/api.js"
import OfflineBadge from "./components/OfflineBadge.jsx"
import SplashScreen from "./components/SplashScreen.jsx"
import RoleSelectScreen from "./components/RoleSelectScreen.jsx"
import LoginScreen from "./components/LoginScreen.jsx"
import HomeScreen from "./components/HomeScreen.jsx"
import DoctorHomeScreen from "./components/DoctorHomeScreen.jsx"
import RegisterPatient from "./components/RegisterPatient.jsx"
import ABHAScannerScreen from "./components/ABHAScannerScreen.jsx"
import PrescriptionScreen from "./components/PrescriptionScreen.jsx"
import AISymptomChecker from "./components/AISymptomChecker.jsx"
import PatientsScreen from "./components/PatientsScreen.jsx"
import PendingSyncScreen from "./components/PendingSyncScreen.jsx"
import NotificationsScreen from "./components/NotificationsScreen.jsx"
import ProfileScreen from "./components/ProfileScreen.jsx"
import EmergencySOSScreen from "./components/EmergencySOSScreen.jsx"
import MedicineInventoryScreen from "./components/MedicineInventoryScreen.jsx"
import PatientHomeScreen from "./components/PatientHomeScreen.jsx"
import PatientSymptomScreen from "./components/PatientSymptomScreen.jsx"
import PatientPrescriptionScreen from "./components/PatientPrescriptionScreen.jsx"
import PatientCallScreen from "./components/PatientCallScreen.jsx"
import PatientMedicinesScreen from "./components/PatientMedicinesScreen.jsx"
import PatientHealthRecordScreen from "./components/PatientHealthRecordScreen.jsx"
import PatientContactAshaScreen from "./components/PatientContactAshaScreen.jsx"
import PatientFacilitiesScreen from "./components/PatientFacilitiesScreen.jsx"
import PatientFamilyContactsScreen from "./components/PatientFamilyContactsScreen.jsx"
import PatientLoginScreen from "./components/PatientLoginScreen.jsx"
import PatientRegisterScreen from "./components/PatientRegisterScreen.jsx"
import AshaRegisterScreen from "./components/AshaRegisterScreen.jsx"
import DoctorRegisterScreen from "./components/DoctorRegisterScreen.jsx"
import MaternalChildHealthScreen from "./components/MaternalChildHealthScreen.jsx"

export default function App() {
  const [screen, setScreen] = useState("splash")
  const [role, setRole] = useState(null)
  const [currentPatient, setCurrentPatient] = useState(() => getAuthUser())
  const [scannedPatient, setScannedPatient] = useState(null)

  // Language for the patient-side screens only (persisted independently)
  const [patientLang, setPatientLangState] = useState(() => {
    try {
      return localStorage.getItem("ayushlink_patient_lang") || "en"
    } catch {
      return "en"
    }
  })
  const setPatientLang = (l) => {
    setPatientLangState(l)
    try {
      localStorage.setItem("ayushlink_patient_lang", l)
    } catch {}
  }

  // Language for the ASHA worker screens (persisted independently)
  const [ashaLang, setAshaLangState] = useState(() => {
    try {
      return localStorage.getItem("ayushlink_asha_lang") || "en"
    } catch {
      return "en"
    }
  })
  const setAshaLang = (l) => {
    setAshaLangState(l)
    try {
      localStorage.setItem("ayushlink_asha_lang", l)
    } catch {}
  }

  const [callSessionId, setCallSessionId] = useState(0)

  const goToRoleHome = () => {
    if (role === "patient") return setScreen("patient-home")
    if (role === "doctor") return setScreen("doctor-home")
    return setScreen("home")
  }

  const handlePatientLogout = () => {
    clearAuthSession()
    setCurrentPatient(null)
    setScreen("patient-login")
  }

  const handleSelect = (id) => {
    if (id === "register") setScreen("register")
    if (id === "abha-scan") setScreen("abha-scan")
    if (id === "prescriptions") setScreen("prescriptions")
    if (id === "ai") setScreen("ai")
    if (id === "patients") setScreen("patients")
    if (id === "sync") setScreen("sync")
    if (id === "notifications" || id === "alerts") setScreen("notifications")
    if (id === "profile") setScreen("profile")
    if (id === "sos") setScreen("sos")
    if (id === "inventory") setScreen("inventory")
    if (id === "mch") setScreen("mch")
    if (id === "patient-home") setScreen("patient-home")
    if (id === "patient-symptoms") setScreen("patient-symptoms")
    if (id === "patient-prescription") setScreen("patient-prescription")
    if (id === "patient-call") {
      setCallSessionId((n) => n + 1)
      setScreen("patient-call")
    }
    if (id === "patient-medicines") setScreen("patient-medicines")
    if (id === "patient-health-record") setScreen("patient-health-record")
    if (id === "patient-contact-asha") setScreen("patient-contact-asha")
    if (id === "patient-facilities") setScreen("patient-facilities")
    if (id === "patient-family") setScreen("patient-family")
    if (id === "patient-sos") setScreen("patient-sos")
  }

  return (
    <>
      <OfflineBadge lang={role === "patient" ? patientLang : ashaLang} />
      {screen === "splash" && <SplashScreen onGetStarted={() => setScreen("role-select")} />}
      {screen === "role-select" && (
        <RoleSelectScreen
          lang={role === "patient" ? patientLang : ashaLang}
          onLangChange={(l) => {
            setAshaLang(l)
            setPatientLang(l)
          }}
          onSelectRole={(chosenRole) => {
            setRole(chosenRole)
            if (chosenRole === "patient") {
              setScreen("patient-login")
            } else {
              setScreen("login")
            }
          }}
        />
      )}
      {screen === "login" && (
        <LoginScreen
          role={role}
          lang={ashaLang}
          onLangChange={setAshaLang}
          onLogin={goToRoleHome}
          onCreateAccount={() => {
            if (role === "doctor") {
              setScreen("doctor-register")
            } else {
              setScreen("asha-register")
            }
          }}
          onBack={() => setScreen("role-select")}
        />
      )}
      {screen === "asha-register" && (
        <AshaRegisterScreen
          lang={ashaLang}
          onLangChange={setAshaLang}
          onBack={() => setScreen("login")}
          onLoginClick={() => setScreen("login")}
          onRegister={() => {
            setRole("asha")
            setScreen("home")
          }}
        />
      )}
      {screen === "doctor-register" && (
        <DoctorRegisterScreen
          lang={ashaLang}
          onLangChange={setAshaLang}
          onBack={() => setScreen("login")}
          onLoginClick={() => setScreen("login")}
          onRegister={() => {
            setRole("doctor")
            setScreen("doctor-home")
          }}
        />
      )}
      {screen === "patient-login" && (
        <PatientLoginScreen
          lang={patientLang}
          onLangChange={setPatientLang}
          onLogin={(patientObj) => {
            setCurrentPatient(patientObj)
            if (patientObj?.preferred_language) {
              setPatientLang(patientObj.preferred_language)
            }
            setScreen("patient-home")
          }}
          onCreateAccount={() => setScreen("patient-register")}
          onBack={() => setScreen("role-select")}
        />
      )}
      {screen === "patient-register" && (
        <PatientRegisterScreen
          lang={patientLang}
          onLangChange={setPatientLang}
          onBack={() => setScreen("patient-login")}
          onRegister={(patientObj) => {
            setCurrentPatient(patientObj)
            if (patientObj?.preferred_language || patientObj?.preferredLanguage) {
              setPatientLang(patientObj.preferred_language || patientObj.preferredLanguage)
            }
            setScreen("patient-home")
          }}
          onGetAshaHelp={() => setScreen("patient-register-asha-help")}
        />
      )}
      {screen === "patient-register-asha-help" && (
        <PatientContactAshaScreen lang={patientLang} onBack={() => setScreen("patient-register")} />
      )}
      {screen === "home" && (
        <HomeScreen
          lang={ashaLang}
          onLangChange={setAshaLang}
          onSelect={handleSelect}
          onBack={() => {
            clearAuthSession()
            setRole("asha")
            setScreen("login")
          }}
        />
      )}
      {screen === "doctor-home" && (
        <DoctorHomeScreen
          onSelect={handleSelect}
          onBack={() => {
            clearAuthSession()
            setRole(null)
            setScreen("role-select")
          }}
        />
      )}
      {screen === "patient-home" && (
        <PatientHomeScreen
          patient={currentPatient}
          lang={patientLang}
          onLangChange={setPatientLang}
          onSelect={handleSelect}
          onBack={handlePatientLogout}
        />
      )}
      {screen === "patient-symptoms" && (
        <PatientSymptomScreen lang={patientLang} onBack={() => setScreen("patient-home")} />
      )}
      {screen === "patient-prescription" && (
        <PatientPrescriptionScreen lang={patientLang} onBack={() => setScreen("patient-home")} />
      )}
      {screen === "patient-call" && (
        <PatientCallScreen key={callSessionId} lang={patientLang} onBack={() => setScreen("patient-home")} />
      )}
      {screen === "patient-medicines" && (
        <PatientMedicinesScreen lang={patientLang} onBack={() => setScreen("patient-home")} />
      )}
      {screen === "patient-health-record" && (
        <PatientHealthRecordScreen lang={patientLang} onBack={() => setScreen("patient-home")} />
      )}
      {screen === "patient-contact-asha" && (
        <PatientContactAshaScreen lang={patientLang} onBack={() => setScreen("patient-home")} />
      )}
      {screen === "patient-facilities" && (
        <PatientFacilitiesScreen lang={patientLang} onBack={() => setScreen("patient-home")} />
      )}
      {screen === "patient-family" && (
        <PatientFamilyContactsScreen lang={patientLang} onBack={() => setScreen("patient-home")} />
      )}
      {screen === "patient-sos" && (
        <EmergencySOSScreen lang={patientLang} onBack={() => setScreen("patient-home")} />
      )}
      {screen === "register" && (
        <RegisterPatient
          lang={ashaLang}
          initialData={scannedPatient}
          onBack={() => {
            setScannedPatient(null)
            goToRoleHome()
          }}
          onSave={() => {
            setScannedPatient(null)
            goToRoleHome()
          }}
          onSyncLater={() => {
            setScannedPatient(null)
            goToRoleHome()
          }}
        />
      )}
      {screen === "abha-scan" && (
        <ABHAScannerScreen
          lang={ashaLang}
          onBack={goToRoleHome}
          onRegisterPatient={(profile) => {
            setScannedPatient(profile)
            setScreen("register")
          }}
        />
      )}
      {screen === "prescriptions" && (
        <PrescriptionScreen lang={ashaLang} onBack={goToRoleHome} />
      )}
      {screen === "ai" && (
        <AISymptomChecker
          lang={ashaLang}
          onLangChange={setAshaLang}
          onBack={goToRoleHome}
          onReferPHC={() => setScreen("patients")}
          onEmergency={() => setScreen("sos")}
        />
      )}
      {screen === "patients" && (
        <PatientsScreen
          lang={ashaLang}
          onBack={goToRoleHome}
          onRegisterNew={() => setScreen("register")}
        />
      )}
      {screen === "sync" && <PendingSyncScreen lang={ashaLang} onBack={goToRoleHome} />}
      {screen === "notifications" && (
        <NotificationsScreen lang={ashaLang} onBack={goToRoleHome} />
      )}
      {screen === "profile" && (
        <ProfileScreen
          lang={ashaLang}
          onLangChange={setAshaLang}
          onBack={goToRoleHome}
          onLogout={() => {
            clearAuthSession()
            setRole("asha")
            setScreen("login")
          }}
        />
      )}
      {screen === "sos" && <EmergencySOSScreen lang={ashaLang} onBack={goToRoleHome} />}
      {screen === "inventory" && (
        <MedicineInventoryScreen lang={ashaLang} onBack={goToRoleHome} />
      )}
      {screen === "mch" && (
        <MaternalChildHealthScreen lang={ashaLang} onBack={goToRoleHome} />
      )}
    </>
  )
}
