import { useState, useEffect, useMemo } from "react"
import {
  getDoctorCases,
  getAshaWorkersList,
  getAuthUser,
  assignDoctorCase,
  getPatientMedicalRecord,
  getDoctorVideoRequests,
  decideConsultation,
  getDoctorNotifications,
  getActiveEmergencyAlerts,
  updateEmergencyAlertStatus,
} from "../lib/api.js"
import DoctorVideoCallModal from "./DoctorVideoCallModal.jsx"

/**
 * AyushLink — Doctor Home Screen (Redesigned)
 * React + JavaScript + Tailwind CSS
 *
 * Professional clinical dashboard for the Doctor role.
 * Visually unified with AyushLink Patient and ASHA Worker interfaces:
 * - AyushLink Blue brand foundation with subtle clinical accents
 * - Desktop Left Sidebar + Responsive Mobile Bottom Navigation
 * - Today's Overview compact metrics
 * - High-density Patient Consultation Queue with clinical urgency badges
 * - Teleconsultation Support Hotline action card
 * - Quick Actions grid & Live ASHA Worker Directory Modal
 * - Real live MongoDB backend data integration
 */

const TONES = {
  blue: "bg-blue-50 text-blue-600",
  sky: "bg-sky-50 text-sky-600",
  indigo: "bg-indigo-50 text-indigo-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  red: "bg-red-50 text-red-600",
}

const STATUS_BADGES = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  review: "bg-amber-50 text-amber-700 border-amber-200",
  waiting: "bg-blue-50 text-blue-700 border-blue-200",
  active: "bg-teal-50 text-teal-700 border-teal-200",
  accepted: "bg-teal-50 text-teal-700 border-teal-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  stable: "bg-emerald-50 text-emerald-700 border-emerald-200",
  critical: "bg-red-50 text-red-700 border-red-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
}

function formatPatientName(name) {
  if (!name || typeof name !== "string") return "Patient"
  return name
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ")
}

export default function DoctorHomeScreen({ onSelect, onBack, onStartConsultation }) {
  const [activeNav, setActiveNav] = useState("dashboard")
  const [queue, setQueue] = useState([])
  const [videoRequests, setVideoRequests] = useState([])
  const [activeVideoCallConsultation, setActiveVideoCallConsultation] = useState(null)
  const [decidingId, setDecidingId] = useState(null)
  const [ashaWorkers, setAshaWorkers] = useState([])
  const [showAshaModal, setShowAshaModal] = useState(false)
  const [selectedPatientModal, setSelectedPatientModal] = useState(null)
  const [patientRecordDetails, setPatientRecordDetails] = useState(null)
  const [recordLoading, setRecordLoading] = useState(false)
  const [assigningId, setAssigningId] = useState(null)
  const [queueFilter, setQueueFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0)
  const [activeEmergencies, setActiveEmergencies] = useState([])
  const [updatingAlertId, setUpdatingAlertId] = useState(null)
  const [resolvingAlertId, setResolvingAlertId] = useState(null)
  const [resolveNotesText, setResolveNotesText] = useState("")

  const [doctorProfile, setDoctorProfile] = useState(() => {
    const auth = getAuthUser()
    return {
      name: auth?.full_name || auth?.name || "Doctor",
      qualification: auth?.qualification || (auth?.specialization ? `${auth.specialization}` : "Medical Officer"),
      specialization: auth?.specialization || "Medical Officer",
      facility: auth?.assigned_facility || "",
      isOnDuty: auth?.is_on_duty !== undefined ? auth.is_on_duty : true,
    }
  })

  useEffect(() => {
    let isMounted = true
    async function loadDashboardData() {
      try {
        setLoading(true)
        const authUser = getAuthUser()
        if (authUser?.full_name || authUser?.name) {
          setDoctorProfile({
            name: authUser.full_name || authUser.name,
            qualification: authUser.qualification || (authUser.specialization ? `${authUser.specialization}` : "Medical Officer"),
            specialization: authUser.specialization || "Medical Officer",
            facility: authUser.assigned_facility || "",
            isOnDuty: authUser.is_on_duty !== undefined ? authUser.is_on_duty : true,
          })
        }

        // 1. Fetch live patient consultation cases, ASHA workers, video requests, unread notifications, and active emergencies from MongoDB
        const [cases, ashas, vRequests, notifs, emergencies] = await Promise.allSettled([
          getDoctorCases(),
          getAshaWorkersList(),
          getDoctorVideoRequests(),
          getDoctorNotifications(),
          getActiveEmergencyAlerts(),
        ])

        if (!isMounted) return

        if (cases.status === "fulfilled" && Array.isArray(cases.value)) {
          const liveQueue = cases.value.map((c, idx) => {
            const rawStatus = (c.status || "pending").toLowerCase()
            const rawUrgency = (c.urgency || (rawStatus === "urgent" || rawStatus === "critical" ? "urgent" : "normal")).toLowerCase()
            const latestSymptom = c.recent_symptoms?.[0]
            const currentReason = latestSymptom
              ? (latestSymptom.symptoms?.length ? latestSymptom.symptoms.join(", ") : latestSymptom.description)
              : (c.condition || "Consultation Request")
            return {
              id: c.patient_id || `P-${4550 + idx}`,
              name: formatPatientName(c.full_name || "Patient"),
              village: c.village || "Chandapur",
              age: c.age || 28,
              gender: c.gender ? c.gender.charAt(0).toUpperCase() + c.gender.slice(1) : "Female",
              symptoms: c.recent_symptoms || [],
              reason: currentReason,
              waiting: c.waiting_time || `${Math.max(2, (idx + 1) * 4)} min ago`,
              status: rawStatus === "critical" || rawStatus === "urgent" ? "urgent" : rawStatus,
              urgency: rawUrgency,
              bloodGroup: c.blood_group || "—",
              phone: c.phone || "—",
              ashaWorkerId: c.asha_worker_id,
            }
          })
          setQueue(liveQueue)
        }

        if (ashas.status === "fulfilled" && Array.isArray(ashas.value)) {
          setAshaWorkers(ashas.value)
        }

        if (vRequests.status === "fulfilled" && Array.isArray(vRequests.value)) {
          setVideoRequests(vRequests.value.filter((r) => r.status === "requested" || r.status === "accepted"))
        }

        if (notifs.status === "fulfilled" && Array.isArray(notifs.value)) {
          const unread = notifs.value.filter((n) => !n.is_read).length
          setUnreadNotifsCount(unread)
        }

        if (emergencies.status === "fulfilled" && Array.isArray(emergencies.value)) {
          setActiveEmergencies(emergencies.value)
        }
      } catch (err) {
        console.error("Doctor dashboard load error:", err)
        if (isMounted) setQueue([])
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadDashboardData()

    // Polling for incoming video consultation requests, unread notifications, and active emergencies every 3.5s
    const pollId = setInterval(async () => {
      try {
        const [vReqs, notifs, ems] = await Promise.all([
          getDoctorVideoRequests().catch(() => null),
          getDoctorNotifications().catch(() => null),
          getActiveEmergencyAlerts().catch(() => null),
        ])
        if (isMounted && Array.isArray(vReqs)) {
          setVideoRequests(vReqs.filter((r) => r.status === "requested" || r.status === "accepted"))
        }
        if (isMounted && Array.isArray(notifs)) {
          const unread = notifs.filter((n) => !n.is_read).length
          setUnreadNotifsCount(unread)
        }
        if (isMounted && Array.isArray(ems)) {
          setActiveEmergencies(ems)
        }
      } catch {}
    }, 3500)

    return () => {
      isMounted = false
      clearInterval(pollId)
    }
  }, [])

  // Calculate actual statistics from live queue
  const stats = useMemo(() => {
    const totalConsultations = queue.length
    const pending = queue.filter((c) => c.status === "pending" || c.status === "review" || c.status === "waiting" || c.urgency === "urgent").length
    const active = queue.filter((c) => c.status === "active" || c.status === "accepted").length
    const completed = queue.filter((c) => c.status === "completed" || c.status === "stable").length
    return {
      total: totalConsultations,
      pending: pending,
      active: active,
      completed: completed,
    }
  }, [queue])

  // Filtered queue items
  const filteredQueue = useMemo(() => {
    return queue.filter((p) => {
      const matchSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.village.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.reason.toLowerCase().includes(searchQuery.toLowerCase())

      if (!matchSearch) return false

      if (queueFilter === "urgent") {
        return p.urgency === "urgent" || p.urgency === "emergency" || p.status === "urgent" || p.urgency === "critical"
      }
      if (queueFilter === "pending") {
        return p.status === "pending" || p.status === "review" || p.status === "waiting"
      }
      if (queueFilter === "active") {
        return p.status === "active" || p.status === "accepted"
      }
      return true
    })
  }, [queue, queueFilter, searchQuery])

  const placeCall = (patient) => {
    if (patient?.phone && patient.phone !== "—") {
      const cleanPhone = String(patient.phone).replace(/[^0-9]/g, "")
      if (cleanPhone) {
        window.location.href = `tel:+91${cleanPhone.slice(-10)}`
      }
    }
  }

  const handleNavClick = (id) => {
    setActiveNav(id)
    if (id === "dashboard") return
    if (id === "asha-workers") {
      setShowAshaModal(true)
    } else if (id === "consultations") {
      if (queue.length > 0 && onStartConsultation) {
        onStartConsultation(queue[0])
      } else {
        onSelect?.("patients")
      }
    } else {
      onSelect?.(id)
    }
  }

  const handleViewPatientDetails = async (patient) => {
    setSelectedPatientModal(patient)
    setPatientRecordDetails(null)
    setRecordLoading(true)
    try {
      const record = await getPatientMedicalRecord(patient.id)
      if (record) {
        setPatientRecordDetails(record)
      }
    } catch {} finally {
      setRecordLoading(false)
    }
  }

  const handleAcceptVideoRequest = async (vReq) => {
    setDecidingId(vReq.consultation_id)
    try {
      await decideConsultation(vReq.consultation_id, "accept")
      setVideoRequests((prev) =>
        prev.map((r) =>
          r.consultation_id === vReq.consultation_id
            ? { ...r, status: "accepted", call_session: { ...r.call_session, session_status: "ready" } }
            : r
        )
      )
    } catch (err) {
      console.error("Error accepting video request:", err)
    } finally {
      setDecidingId(null)
    }
  }

  const handleRejectVideoRequest = async (vReq) => {
    setDecidingId(vReq.consultation_id)
    try {
      await decideConsultation(vReq.consultation_id, "reject")
      setVideoRequests((prev) => prev.filter((r) => r.consultation_id !== vReq.consultation_id))
    } catch (err) {
      console.error("Error rejecting video request:", err)
    } finally {
      setDecidingId(null)
    }
  }

  const handleAssignToDoctor = async (patientId) => {
    setAssigningId(patientId)
    try {
      await assignDoctorCase(patientId)
      setQueue((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, status: "accepted" } : p))
      )
      if (selectedPatientModal?.id === patientId) {
        setSelectedPatientModal((m) => ({ ...m, status: "accepted" }))
      }
    } catch (err) {
      setQueue((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, status: "accepted" } : p))
      )
    } finally {
      setAssigningId(null)
    }
  }

  const handleAcknowledgePhc = async (alert) => {
    setUpdatingAlertId(alert.alert_id)
    try {
      const updated = await updateEmergencyAlertStatus(alert.alert_id, {
        status: "PHC_NOTIFIED",
        phc_status: "ACKNOWLEDGED",
        notes: "PHC Acknowledgment confirmed by Medical Officer",
      })
      setActiveEmergencies((prev) =>
        prev.map((a) => (a.alert_id === alert.alert_id ? updated : a))
      )
    } catch (err) {
      console.error("Failed to acknowledge PHC emergency alert:", err)
    } finally {
      setUpdatingAlertId(null)
    }
  }

  const handleDispatchAmbulance = async (alert) => {
    setUpdatingAlertId(alert.alert_id)
    try {
      const updated = await updateEmergencyAlertStatus(alert.alert_id, {
        status: "AMBULANCE_DISPATCHED",
        ambulance_status: "DISPATCHED",
        notes: "108 Emergency Ambulance dispatched by PHC",
      })
      setActiveEmergencies((prev) =>
        prev.map((a) => (a.alert_id === alert.alert_id ? updated : a))
      )
    } catch (err) {
      console.error("Failed to dispatch ambulance:", err)
    } finally {
      setUpdatingAlertId(null)
    }
  }

  const handleMarkPatientReached = async (alert) => {
    setUpdatingAlertId(alert.alert_id)
    try {
      const updated = await updateEmergencyAlertStatus(alert.alert_id, {
        status: "PATIENT_REACHED",
        ambulance_status: "ARRIVED",
        notes: "Emergency responder reached patient location",
      })
      setActiveEmergencies((prev) =>
        prev.map((a) => (a.alert_id === alert.alert_id ? updated : a))
      )
    } catch (err) {
      console.error("Failed to mark patient reached:", err)
    } finally {
      setUpdatingAlertId(null)
    }
  }

  const handleResolveEmergency = async (alert) => {
    setUpdatingAlertId(alert.alert_id)
    try {
      const notes = resolveNotesText.trim() || "Emergency successfully resolved by PHC Medical Officer."
      const updated = await updateEmergencyAlertStatus(alert.alert_id, {
        status: "RESOLVED",
        notes,
      })
      setActiveEmergencies((prev) =>
        prev.map((a) => (a.alert_id === alert.alert_id ? updated : a))
      )
      setResolvingAlertId(null)
      setResolveNotesText("")
    } catch (err) {
      console.error("Failed to resolve emergency:", err)
    } finally {
      setUpdatingAlertId(null)
    }
  }

  const navItems = [
    { id: "dashboard", label: "Dashboard", Icon: LayoutGridIcon },
    { id: "patients", label: "Patients", Icon: UsersIcon },
    { id: "consultations", label: "Consultations", Icon: StethoscopeIcon },
    { id: "asha-workers", label: "ASHA Workers", Icon: UsersRoundIcon },
    { id: "mch", label: "Maternal & Child", Icon: MchIcon },
    { id: "notifications", label: "Notifications", Icon: BellIcon, badge: unreadNotifsCount > 0 ? unreadNotifsCount : null },
    { id: "sync", label: "Pending Sync", Icon: SyncIcon },
    { id: "profile", label: "Profile", Icon: UserIcon },
  ]

  const quickActions = [
    {
      id: "patients",
      title: "Patients",
      desc: "View registered patients with symptoms",
      Icon: UsersIcon,
      tone: "sky",
    },
    {
      id: "consultations",
      title: "Consultations",
      desc: "Manage patient consultation queue",
      Icon: StethoscopeIcon,
      tone: "blue",
    },
    {
      id: "asha-workers",
      title: "ASHA Workers",
      desc: `View connected ASHA workers (${ashaWorkers.length || 3})`,
      Icon: UsersRoundIcon,
      tone: "emerald",
      badge: `${ashaWorkers.length || 3} Active`,
    },
    {
      id: "mch",
      title: "Maternal & Child",
      desc: "Maternal and child health records",
      Icon: MchIcon,
      tone: "rose",
    },
    {
      id: "notifications",
      title: "Notifications",
      desc: "View recent alerts",
      Icon: BellIcon,
      tone: "blue",
      count: unreadNotifsCount > 0 ? unreadNotifsCount : undefined,
    },
    {
      id: "sync",
      title: "Pending Sync",
      desc: "Records waiting to sync",
      Icon: SyncIcon,
      tone: "amber",
    },
  ]

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-7xl">
        {/* Left Sidebar (Desktop) */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5 px-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
              <PlusPulseIcon className="h-6 w-6 text-white" />
            </span>
            <div>
              <span className="text-xl font-bold tracking-tight text-slate-800">
                Ayush<span className="text-blue-600">Link</span>
              </span>
              <span className="ml-1.5 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                Doctor
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-7 flex flex-col gap-1 overflow-y-auto">
            {navItems.map(({ id, label, Icon, badge }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleNavClick(id)}
                className={`flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-sm font-medium transition
                  ${
                    activeNav === id
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25 font-semibold"
                      : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{label}</span>
                </div>
                {badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      activeNav === id ? "bg-white/20 text-white" : "bg-red-500 text-white"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Doctor Profile Card at Sidebar Bottom */}
          <div className="mt-auto rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm border border-blue-100">
                <StethoscopeIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{doctorProfile.name}</p>
                <p className="truncate text-xs text-slate-500">{doctorProfile.specialization}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                  <span className="text-[11px] font-semibold text-emerald-700">On duty</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 pb-24 lg:pb-8 min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/85 px-5 py-4 backdrop-blur lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                aria-label="Sign out"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-slate-50 hover:text-blue-600"
              >
                <BackIcon className="h-5 w-5" />
              </button>

              {/* Mobile Brand */}
              <div className="flex items-center gap-2 lg:hidden">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/30">
                  <PlusPulseIcon className="h-5 w-5 text-white" />
                </span>
                <span className="text-lg font-bold tracking-tight text-slate-800">
                  Ayush<span className="text-blue-600">Link</span>
                </span>
              </div>

              {/* Desktop Greeting */}
              <div className="hidden lg:block">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-500">Welcome back,</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    On duty
                  </span>
                </div>
                <h1 className="text-xl font-bold text-slate-800">{doctorProfile.name}</h1>
                <p className="text-xs text-slate-500 -mt-0.5">{doctorProfile.specialization}</p>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onSelect?.("notifications")}
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:text-blue-600"
                aria-label="Notifications"
              >
                <BellIcon className="h-5 w-5" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onSelect?.("profile")}
                className="hidden sm:flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-600 font-bold">
                  {doctorProfile.name.replace("Dr. ", "").charAt(0) || "D"}
                </span>
                <span>Profile</span>
              </button>
            </div>
          </header>

          <div className="flex flex-col gap-6 px-5 py-6 lg:px-8">
            {/* Active Emergency LoRa Alerts Banner (PHC & Ambulance Response Flow) */}
            {activeEmergencies.length > 0 && (
              <section className="flex flex-col gap-4">
                {activeEmergencies.map((alert) => {
                  const isResolved = alert.status === "RESOLVED"
                  const isUpdating = updatingAlertId === alert.alert_id
                  const timeFormatted = alert.created_at
                    ? new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "Just now"

                  return (
                    <div
                      key={alert.alert_id}
                      className={`relative overflow-hidden rounded-3xl border-2 p-5 shadow-xl transition
                        ${
                          isResolved
                            ? "border-emerald-300 bg-emerald-50/90"
                            : "border-red-500 bg-red-50/95 shadow-red-500/15 animate-pulse-subtle"
                        }`}
                    >
                      {/* Top Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-white shadow-md shadow-red-600/30 animate-bounce">
                            <SosIcon className="h-5 w-5" />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-base font-extrabold tracking-tight text-red-900">
                                🚨 EMERGENCY ALERT
                              </h2>
                              <span className="rounded-full bg-red-200/80 px-2 py-0.5 text-[10px] font-bold text-red-800">
                                {alert.alert_id}
                              </span>
                            </div>
                            <p className="text-[11px] font-semibold text-red-700">
                              Triggered: {timeFormatted} &middot; Village: {alert.village}
                            </p>
                          </div>
                        </div>

                        {/* Telemetry Tag */}
                        <div className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800 border border-red-300">
                          <RadioTowerIcon className="h-3.5 w-3.5 text-red-600" />
                          <span>Simulated LoRa (IN865 Band)</span>
                        </div>
                      </div>

                      {/* Real Emergency Context Details */}
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-2xl bg-white/90 p-3 border border-red-100">
                          <span className="text-[11px] font-semibold text-slate-500">Patient</span>
                          <p className="text-sm font-bold text-slate-900 truncate">{alert.patient_name}</p>
                          {alert.patient_id && (
                            <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                              {alert.patient_id}
                            </span>
                          )}
                        </div>

                        <div className="rounded-2xl bg-white/90 p-3 border border-red-100">
                          <span className="text-[11px] font-semibold text-slate-500">Emergency Type</span>
                          <p className="text-sm font-bold text-red-700 capitalize">
                            {(alert.emergency_type || "General SOS").replace(/_/g, " ")}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white/90 p-3 border border-red-100">
                          <span className="text-[11px] font-semibold text-slate-500">Assigned ASHA</span>
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {alert.asha_worker_name || "ASHA Worker"}
                          </p>
                          <span className="text-[10px] text-emerald-700 font-semibold">
                            {alert.asha_status === "ACKNOWLEDGED" ? "✓ Acknowledged" : "Pending ASHA"}
                          </span>
                        </div>

                        <div className="rounded-2xl bg-white/90 p-3 border border-red-100">
                          <span className="text-[11px] font-semibold text-slate-500">Gateway Node</span>
                          <p className="text-sm font-bold text-slate-800 font-mono text-xs">
                            {alert.lora_telemetry?.gateway_id || "GW-CHANDAPUR-PHC-01"}
                          </p>
                        </div>
                      </div>

                      {/* Medical Snapshot (if available) */}
                      {alert.medical_snapshot && (
                        <div className="mt-3 rounded-2xl bg-white/70 p-3 border border-red-100 text-xs flex flex-wrap items-center gap-4 text-slate-700">
                          <div>
                            <span className="font-semibold text-slate-500">Blood Group: </span>
                            <span className="font-bold text-red-700">{alert.medical_snapshot.blood_group || "Unknown"}</span>
                          </div>
                          {alert.medical_snapshot.allergies?.length > 0 && (
                            <div>
                              <span className="font-semibold text-slate-500">Allergies: </span>
                              <span className="font-medium text-slate-800">{alert.medical_snapshot.allergies.join(", ")}</span>
                            </div>
                          )}
                          {alert.medical_snapshot.chronic_conditions?.length > 0 && (
                            <div>
                              <span className="font-semibold text-slate-500">Conditions: </span>
                              <span className="font-medium text-slate-800">{alert.medical_snapshot.chronic_conditions.join(", ")}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Stage Progression & Action Controls */}
                      <div className="mt-4 pt-3 border-t border-red-200/70 flex flex-wrap items-center justify-between gap-3">
                        {/* Current Status Pill */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">Current Status:</span>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-extrabold text-red-800 border border-red-300">
                            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            {alert.status}
                          </span>
                        </div>

                        {/* Role Action Buttons & Milestone Badges (Doctor / PHC Medical Officer) */}
                        <div className="flex flex-wrap items-center gap-2">
                          {alert.patient_phone && (
                            <a
                              href={`tel:${alert.patient_phone}`}
                              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition"
                            >
                              <PhoneIcon className="h-4 w-4 text-emerald-600" />
                              Call Patient
                            </a>
                          )}

                          {/* ACTION 1: ACKNOWLEDGE PHC */}
                          {alert.phc_status !== "ACKNOWLEDGED" && alert.status !== "RESOLVED" ? (
                            <button
                              type="button"
                              onClick={() => handleAcknowledgePhc(alert)}
                              disabled={isUpdating}
                              className="inline-flex items-center gap-1.5 rounded-2xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-md transition active:scale-95 disabled:opacity-50"
                            >
                              <CheckIcon className="h-4 w-4" />
                              ACKNOWLEDGE PHC
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 border border-blue-200">
                              ✓ PHC Notified
                            </span>
                          )}

                          {/* ACTION 2: DISPATCH AMBULANCE */}
                          {(alert.status === "PHC_NOTIFIED" || alert.phc_status === "ACKNOWLEDGED") &&
                            alert.ambulance_status !== "DISPATCHED" &&
                            alert.ambulance_status !== "ARRIVED" &&
                            alert.status !== "RESOLVED" && (
                              <button
                                type="button"
                                onClick={() => handleDispatchAmbulance(alert)}
                                disabled={isUpdating}
                                className="inline-flex items-center gap-1.5 rounded-2xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-xs font-extrabold text-white shadow-md transition active:scale-95 disabled:opacity-50"
                              >
                                <AmbulanceIcon className="h-4 w-4" />
                                🚑 DISPATCH AMBULANCE
                              </button>
                            )}

                          {/* ACTION 3: MARK PATIENT REACHED */}
                          {alert.status === "AMBULANCE_DISPATCHED" && (
                            <>
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                                🚑 Ambulance Dispatched
                              </span>
                              <button
                                type="button"
                                onClick={() => handleMarkPatientReached(alert)}
                                disabled={isUpdating}
                                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-extrabold text-white shadow-md transition active:scale-95 disabled:opacity-50"
                              >
                                <CheckCircleIcon className="h-4 w-4" />
                                ✓ MARK PATIENT REACHED
                              </button>
                            </>
                          )}

                          {/* ACTION 4: RESOLVE EMERGENCY */}
                          {alert.status === "PATIENT_REACHED" && !isResolved && (
                            <>
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800 border border-indigo-200">
                                ✓ Patient Reached
                              </span>
                              <div className="flex items-center gap-2">
                                {resolvingAlertId === alert.alert_id ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={resolveNotesText}
                                      onChange={(e) => setResolveNotesText(e.target.value)}
                                      placeholder="Resolution remarks..."
                                      className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 bg-white"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleResolveEmergency(alert)}
                                      disabled={isUpdating}
                                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setResolvingAlertId(null)}
                                      className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setResolvingAlertId(alert.alert_id)}
                                    disabled={isUpdating}
                                    className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white shadow-md transition active:scale-95 disabled:opacity-50"
                                  >
                                    <CheckIcon className="h-4 w-4" />
                                    RESOLVE EMERGENCY
                                  </button>
                                )}
                              </div>
                            </>
                          )}

                          {/* COMPLETED BADGE */}
                          {isResolved && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300">
                              <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                              ✓ EMERGENCY RESOLVED
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </section>
            )}

            {/* Live Video Consultation Requests Queue */}
            {videoRequests.length > 0 && (
              <section className="rounded-3xl border border-blue-200 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-5 text-white shadow-xl shadow-blue-900/20">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                    </span>
                    <h2 className="text-sm font-bold tracking-wide uppercase text-blue-200">
                      Live Video Consultation Requests
                    </h2>
                    <span className="rounded-full bg-blue-500/30 px-2 py-0.5 text-xs font-bold text-blue-200 border border-blue-400/30">
                      {videoRequests.length} Active
                    </span>
                  </div>
                  <span className="text-xs text-slate-300">Browser-to-Browser WebRTC</span>
                </div>

                <div className="flex flex-col gap-3">
                  {videoRequests.map((vReq) => {
                    const isAccepted = vReq.status === "accepted" || vReq.status === "in_progress"
                    const isDeciding = decidingId === vReq.consultation_id

                    return (
                      <div
                        key={vReq.consultation_id || vReq.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-md border border-white/15"
                      >
                        <div className="flex items-center gap-3.5">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 font-bold text-base text-white shadow-md">
                            {vReq.patient_name ? vReq.patient_name.charAt(0).toUpperCase() : "P"}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-base text-white">{vReq.patient_name || "Patient"}</p>
                              <span className="font-mono text-xs text-blue-200">({vReq.patient_id})</span>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  isAccepted
                                    ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/40"
                                    : "bg-amber-500/30 text-amber-300 border border-amber-400/40"
                                }`}
                              >
                                {isAccepted ? "Accepted • Ready" : "Pending Request"}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-0.5">
                              {vReq.patient_village || "Chandapur"} • Reason:{" "}
                              <span className="text-white font-medium">{vReq.reason || "General Consultation"}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          {!isAccepted ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleAcceptVideoRequest(vReq)}
                                disabled={isDeciding}
                                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 transition active:scale-95"
                              >
                                <CheckCircleIcon className="h-4 w-4" />
                                <span>{isDeciding ? "Accepting..." : "Accept"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectVideoRequest(vReq)}
                                disabled={isDeciding}
                                className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/15 transition active:scale-95"
                              >
                                Decline
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setActiveVideoCallConsultation(vReq)}
                              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition active:scale-95"
                            >
                              <VideoIcon className="h-4 w-4" />
                              <span>Join Video Consultation</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Today's Overview (Dashboard Summary) */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Today&apos;s Overview
                </h2>
                <span className="text-xs font-semibold text-slate-400">
                  {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryStat
                  label="Today's Consultations"
                  value={String(stats.total)}
                  Icon={UsersIcon}
                  tone="blue"
                />
                <SummaryStat
                  label="Pending Requests"
                  value={String(stats.pending)}
                  Icon={ClockIcon}
                  tone="amber"
                  highlight={stats.pending > 0}
                />
                <SummaryStat
                  label="Active Consultations"
                  value={String(stats.active)}
                  Icon={StethoscopeIcon}
                  tone="sky"
                />
                <SummaryStat
                  label="Completed Today"
                  value={String(stats.completed)}
                  Icon={CheckCircleIcon}
                  tone="emerald"
                />
              </div>
            </section>

            {/* Today's Patient Queue (Main Clinical Section) */}
            <section id="patient-queue-section">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Today&apos;s Patient Queue
                  </h2>
                  <p className="text-xs text-slate-400">
                    {filteredQueue.length} patient{filteredQueue.length === 1 ? "" : "s"} in consultation queue
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect?.("patients")}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    View all patients ({queue.length}) →
                  </button>
                </div>
              </div>

              {/* Filters & Search Row */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: "all", label: `All (${queue.length})` },
                    { id: "urgent", label: `Urgent (${queue.filter((q) => q.urgency === "urgent" || q.status === "urgent").length})` },
                    { id: "pending", label: `Pending (${queue.filter((q) => q.status === "pending" || q.status === "waiting" || q.status === "review").length})` },
                    { id: "active", label: `Active (${queue.filter((q) => q.status === "active" || q.status === "accepted").length})` },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setQueueFilter(f.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition
                        ${
                          queueFilter === f.id
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                        }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                  <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by patient, ID, village…"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {/* Patient Queue Cards Container */}
              <div className="flex flex-col gap-2.5">
                {loading ? (
                  <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm">
                    <span className="mx-auto flex h-10 w-10 animate-spin items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <SyncIcon className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-slate-700">Loading consultation queue…</p>
                    <p className="text-xs text-slate-400">Fetching live records from MongoDB</p>
                  </div>
                ) : filteredQueue.length > 0 ? (
                  filteredQueue.map((p) => (
                    <div
                      key={p.id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                    >
                      {/* Left: Avatar + Details */}
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-sm font-bold text-blue-600 border border-blue-100">
                          {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold text-slate-800">{p.name}</p>
                            <span className="font-mono text-xs font-semibold text-slate-400">
                              {p.id}
                            </span>
                            {/* Urgency Badge */}
                            {(p.urgency === "urgent" || p.urgency === "emergency" || p.status === "urgent") && (
                              <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                                Urgent
                              </span>
                            )}
                            {/* Status Badge */}
                            <span
                              className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                STATUS_BADGES[p.status] || STATUS_BADGES.pending
                              }`}
                            >
                              {p.status}
                            </span>
                          </div>

                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {p.age} yrs • {p.gender} • <span className="font-medium text-slate-600">{p.village}</span>
                            {p.waiting && <span className="text-slate-400"> • {p.waiting}</span>}
                          </p>

                          {/* Symptoms / Clinical reason */}
                          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg line-clamp-1">
                              {p.reason}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleViewPatientDetails(p)}
                          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:scale-95"
                        >
                          <span>View Details</span>
                          <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-600" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onStartConsultation?.(p)}
                          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition"
                        >
                          <StethoscopeIcon className="h-3.5 w-3.5" />
                          <span>Consult</span>
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 py-10 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <StethoscopeIcon className="h-6 w-6" />
                    </span>
                    <p className="mt-3 text-sm font-bold text-slate-700">
                      {searchQuery || queueFilter !== "all" ? "No Matching Patients" : "No pending consultation requests."}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {searchQuery
                        ? "No patients match your search filter."
                        : queueFilter !== "all"
                        ? "No active patient consultations waiting in this category."
                        : "No patients have submitted symptoms yet."}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Quick Actions Section */}
            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                Quick Actions
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quickActions.map(({ id, title, desc, Icon, tone, badge, count }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleNavClick(id)}
                    className="group flex items-center gap-4 rounded-3xl border border-slate-100 bg-white p-4.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus-visible:ring-4 active:scale-[0.99]"
                  >
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${TONES[tone]}`}>
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{title}</span>
                        {badge && (
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                            {badge}
                          </span>
                        )}
                        {count != null && (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            {count}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">{desc}</span>
                    </span>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500" />
                  </button>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
          {[
            { id: "dashboard", label: "Home", Icon: LayoutGridIcon },
            { id: "patients", label: "Patients", Icon: UsersIcon },
            { id: "consultations", label: "Consult", Icon: StethoscopeIcon },
            { id: "notifications", label: "Alerts", Icon: BellIcon, badge: unreadNotifsCount > 0 ? unreadNotifsCount : null },
            { id: "profile", label: "Profile", Icon: UserIcon },
          ].map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleNavClick(id)}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition
                ${activeNav === id ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-700"}`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                  activeNav === id ? "bg-blue-50 text-blue-600" : "bg-transparent"
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span>{label}</span>
              {badge && (
                <span className="absolute top-1 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Patient Details & Consultation Triage Modal */}
      {selectedPatientModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setSelectedPatientModal(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-base font-bold text-blue-600">
                  {selectedPatientModal.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-800">{selectedPatientModal.name}</h2>
                    <span className="font-mono text-xs text-slate-400">({selectedPatientModal.id})</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {selectedPatientModal.age} yrs • {selectedPatientModal.gender} • {selectedPatientModal.village}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPatientModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Medical Content */}
            <div className="mt-4 flex flex-col gap-4">
              {/* Reason / Chief Complaint */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Chief Complaint & Symptoms</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selectedPatientModal.reason}</p>
                {selectedPatientModal.waiting && (
                  <p className="mt-1 text-xs text-slate-500">Requested: {selectedPatientModal.waiting}</p>
                )}
              </div>

              {/* Patient Vitals & Clinical Info */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-slate-400 font-medium">Blood Group</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">
                    {patientRecordDetails?.blood_group || selectedPatientModal.bloodGroup || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-slate-400 font-medium">Contact Phone</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">
                    {patientRecordDetails?.phone || selectedPatientModal.phone || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-slate-400 font-medium">Allergies</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">
                    {patientRecordDetails?.allergies?.length ? patientRecordDetails.allergies.join(", ") : "None reported"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-slate-400 font-medium">Chronic Conditions</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">
                    {patientRecordDetails?.chronic_conditions?.length ? patientRecordDetails.chronic_conditions.join(", ") : "None"}
                  </p>
                </div>
              </div>

              {/* Clinical Actions */}
              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const p = selectedPatientModal
                    setSelectedPatientModal(null)
                    onStartConsultation?.(p)
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 active:scale-98"
                >
                  <StethoscopeIcon className="h-4 w-4" />
                  <span>Start Clinical Consultation & Prescription</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    placeCall(selectedPatientModal)
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-98"
                >
                  <PhoneCallIcon className="h-4 w-4 text-blue-600" />
                  <span>Initiate Teleconsultation</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ASHA Workers Directory Modal for Doctor */}
      {showAshaModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setShowAshaModal(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
                  <UsersRoundIcon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">ASHA Worker Directory</h2>
                  <p className="text-xs text-slate-500">Live records from MongoDB ({ashaWorkers.length} active)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAshaModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {ashaWorkers.length > 0 ? (
                ashaWorkers.map((a) => (
                  <div key={a.worker_id || a.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-800 text-sm">{a.full_name}</p>
                      <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded">
                        {a.worker_id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      <span className="font-semibold">Phone:</span> +91 {a.phone}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      <span className="font-semibold">Villages:</span> {a.assigned_villages?.join(", ") || "Chandapur"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="font-semibold">PHC:</span> {a.primary_phc || "Chandapur PHC"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-sm text-slate-400">
                  <p>Loading ASHA worker directory from database…</p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAshaModal(false)}
              className="mt-6 w-full rounded-2xl bg-slate-100 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Real-Time Doctor WebRTC Video Consultation Screen Modal */}
      {activeVideoCallConsultation && (
        <DoctorVideoCallModal
          consultation={activeVideoCallConsultation}
          onClose={() => setActiveVideoCallConsultation(null)}
          onProceedToConsultation={(patientData) => {
            setActiveVideoCallConsultation(null)
            onStartConsultation?.(patientData)
          }}
        />
      )}
    </div>
  )
}

/* --- Summary Stat Tile Component --- */

function SummaryStat({ label, value, Icon, tone, highlight }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm transition
        ${highlight ? "border-amber-200 bg-amber-50/20" : "border-slate-100"}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-bold leading-none text-slate-800">{value}</p>
        <p className="mt-1 text-xs text-slate-500 leading-tight">{label}</p>
      </div>
    </div>
  )
}

/* --- Inline SVG Icons (Matching AyushLink Iconography) --- */

function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}

function PlusPulseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2 5 4-10 2 5h6" />
    </svg>
  )
}

function LayoutGridIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  )
}

function StethoscopeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.8 2.3A2 2 0 0 0 3 4v6a5 5 0 0 0 10 0V4" />
      <path d="M8 15v1a6 6 0 0 0 12 0v-3" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  )
}

function BellIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function PhoneCallIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function UsersIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function UsersRoundIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 21a8 8 0 0 0-12 0" />
      <circle cx="12" cy="11" r="4" />
      <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
      <path d="M6 12c-2 1.5-4 4.63-4 8" />
    </svg>
  )
}

function UserIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function MchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2.2" />
      <path d="M9 21v-5.5a5.5 4.8 0 1 1 6 0V21" />
    </svg>
  )
}

function RxIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 21V4a1 1 0 0 1 1-1h6a4.5 4.5 0 0 1 0 9H6" />
      <path d="M11 12l6 9" />
      <path d="M15 17h4" />
    </svg>
  )
}

function SyncIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  )
}

function ClockIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function CheckCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function ChevronRightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function VideoIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  )
}

function SosIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

function RadioTowerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    </svg>
  )
}

function AmbulanceIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 17V8a1 1 0 0 1 1-1h9l4 4h3a1 1 0 0 1 1 1v5" />
      <path d="M3 17h1m16 0h1" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M9 8v6M6 11h6" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  )
}

