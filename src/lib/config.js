/**
 * AyushLink — shared app config
 *
 * There is no signaling/WebRTC backend deployed yet, so "video call" on
 * both the patient and doctor sides falls back to a REAL phone call to
 * this number. Update this in one place if the helpline number changes.
 */
export const DOCTOR_HELPLINE_NUMBER = "+919372187882"
export const DOCTOR_HELPLINE_DISPLAY = "+91 93721 87882"

// tel: links don't accept spaces; keep the raw dialable string separate
// from the pretty display string above.
export const DOCTOR_HELPLINE_TEL = `tel:${DOCTOR_HELPLINE_NUMBER}`
