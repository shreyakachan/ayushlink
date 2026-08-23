/**
 * Parses the raw string decoded from an ABHA (Ayushman Bharat Health Account)
 * Health Card QR code into a normalized patient profile.
 *
 * ABHA cards issued via the ABDM ecosystem encode a small JSON document in
 * the QR — but the exact key names have varied slightly across issuers/app
 * versions (e.g. "hidn" vs "healthIdNumber" for the ABHA number). Some
 * third-party PHR apps instead encode the profile as a URL with query
 * params, or a semicolon-separated key:value list. This parser is
 * deliberately tolerant: it tries JSON first, then URL params, then a
 * MeCard-style key:value list, and finally falls back to showing the raw
 * scanned text so nothing is ever silently dropped.
 *
 * Everything here runs on-device with no network calls — the whole point
 * is that a health worker can scan a card in a village with zero signal.
 */

// Maps every known alias -> our canonical field name
const FIELD_ALIASES = {
  abhaNumber: ["hidn", "healthIdNumber", "abhaNumber", "ABHANumber", "healthIdNo"],
  abhaAddress: ["hid", "healthId", "abhaAddress", "phrAddress", "healthIdName"],
  name: ["name", "fullName", "patientName"],
  gender: ["gender", "sex"],
  dob: ["dob", "dateOfBirth", "DOB"],
  yearOfBirth: ["yob", "yearOfBirth"],
  mobile: ["mobile", "phone", "phoneNumber", "mobileNumber"],
  email: ["email"],
  address: ["address", "addr"],
  district: ["districtName", "district", "distName"],
  state: ["stateName", "state"],
  pincode: ["pincode", "pinCode", "pin"],
  photo: ["photo", "profilePhoto", "image"],
}

const GENDER_MAP = { M: "Male", F: "Female", O: "Other", T: "Transgender" }

function normalizeFields(source) {
  const profile = {}
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (source[alias] != null && source[alias] !== "") {
        profile[canonical] = source[alias]
        break
      }
    }
  }
  if (profile.gender) {
    const key = String(profile.gender).trim().toUpperCase()
    profile.gender = GENDER_MAP[key] || profile.gender
  }
  if (profile.photo && typeof profile.photo === "string" && !profile.photo.startsWith("data:")) {
    profile.photo = `data:image/jpeg;base64,${profile.photo}`
  }
  profile.age = computeAge(profile.dob, profile.yearOfBirth)
  return profile
}

function computeAge(dob, yob) {
  try {
    let birthYear = yob ? Number(yob) : null
    if (!birthYear && dob) {
      const parts = String(dob).split(/[-/]/).map((p) => p.trim())
      // Accept DD-MM-YYYY, YYYY-MM-DD, or a bare YYYY
      const yearPart = parts.find((p) => p.length === 4)
      if (yearPart) birthYear = Number(yearPart)
    }
    if (!birthYear || Number.isNaN(birthYear)) return null
    const age = new Date().getFullYear() - birthYear
    return age > 0 && age < 130 ? age : null
  } catch {
    return null
  }
}

function hasAnyRecognizedField(profile) {
  return Object.keys(profile).some((k) => k !== "age" && profile[k])
}

export function parseAbhaQr(raw) {
  const text = (raw || "").trim()
  if (!text) {
    return { ok: false, format: "empty", raw: text, profile: null }
  }

  // 1. Try JSON (the standard ABDM QR payload)
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === "object") {
      const profile = normalizeFields(parsed)
      if (hasAnyRecognizedField(profile)) {
        return { ok: true, format: "json", raw: text, profile }
      }
    }
  } catch {
    // not JSON, fall through
  }

  // 2. Try URL with query params (some PHR apps share a profile link)
  try {
    const url = new URL(text)
    const params = Object.fromEntries(url.searchParams.entries())
    const profile = normalizeFields(params)
    if (hasAnyRecognizedField(profile)) {
      return { ok: true, format: "url", raw: text, profile, sourceUrl: text }
    }
  } catch {
    // not a URL, fall through
  }

  // 3. Try MeCard-style "KEY:value;KEY:value;" text
  if (text.includes(":") && text.includes(";")) {
    const kv = {}
    text.split(";").forEach((pair) => {
      const idx = pair.indexOf(":")
      if (idx > 0) {
        const key = pair.slice(0, idx).trim()
        const value = pair.slice(idx + 1).trim()
        if (key) kv[key] = value
      }
    })
    const profile = normalizeFields(kv)
    if (hasAnyRecognizedField(profile)) {
      return { ok: true, format: "keyvalue", raw: text, profile }
    }
  }

  // 4. Unrecognized format — still show what was scanned
  return { ok: false, format: "unknown", raw: text, profile: null }
}
