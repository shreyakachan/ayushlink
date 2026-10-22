import random
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from fastapi import HTTPException, status
from database import (
    get_collection,
    COLLECTION_PATIENTS,
    COLLECTION_SYMPTOMS,
)
from schemas.symptom_analysis import (
    SymptomAnalysisRequest,
    SymptomAnalysisResponse,
)

# ---------------------------------------------------------------------------
# Emergency Red-Flag Lexicon (English, Hindi, Marathi)
# ---------------------------------------------------------------------------
RED_FLAG_PATTERNS = [
    # Cardiac / Chest pain
    r"\b(chest\s*pain|chest\s*pressure|chest\s*tightness|heart\s*attack|angina)\b",
    r"(सीने\s*में\s*दर्द|छाती\s*में\s*दर्द|हार्ट\s*अटैक|हृदयघात)",
    r"(छातीत\s*दुखणे|छातीवर\s*दाब|हृदयविकार)",
    # Respiratory distress
    r"\b(difficulty\s*breathing|shortness\s*of\s*breath|cannot\s*breathe|dyspnea|gasping|choking|cyanosis|blue\s*lips|blue\s*skin)\b",
    r"(सांस\s*लेने\s*में\s*तकलीफ|सांस\s*फूलना|दम\s*घुटना|नीले\s*होंठ)",
    r"(श्वास\s*घेण्यास\s*त्रास|दम\s*लागणे|श्वास\s*कोंडणे|ओठ\s*निळे\s*पडणे)",
    # Neurological / Altered Consciousness
    r"\b(unconscious|fainted|loss\s*of\s*consciousness|seizure|convulsion|convulsions|fits|coma|unresponsive|stroke)\b",
    r"(बेहोश|मूर्छित|दौरा|मिरगी|झटके|चेतनाशून्य|स्ट्रोक)",
    r"(शुद्ध\s*हरपणे|बेहोशी|झटके\s*येणे|फिट्स|पक्षाघात)",
    # Severe Hemorrhage
    r"\b(severe\s*bleeding|coughing\s*blood|vomiting\s*blood|hemorrhage|blood\s*in\s*vomit)\b",
    r"(खून\s*बहना|खून\s*की\s*उल्टी|खांसी\s*में\s*खून|अत्यधिक\s*रक्तस्राव)",
    r"(रक्तस्त्राव|रक्ताची\s*उलटी|खोकल्यातून\s*रक्त|अति\s*रक्तस्त्राव)",
    # Severe Neurological Infection / Meningitis
    r"\b(stiff\s*neck|neck\s*rigidity|inability\s*to\s*bend\s*neck)\b",
    r"(गर्दन\s*में\s*अकड़न|गर्दन\s*का\s*अकड़ना)",
    r"(मान\s*ताठ\s*होणे|मानेची\s*ताठरता)",
]

# Compiled regex for fast red flag scanning
RED_FLAG_REGEX = re.compile("|".join(RED_FLAG_PATTERNS), re.IGNORECASE)

# ---------------------------------------------------------------------------
# Multilingual Guidance Dictionaries
# ---------------------------------------------------------------------------
TRIAGE_CONTENT = {
    "en": {
        "levels": {
            "mild": "Low Risk",
            "moderate": "Medium Risk",
            "severe": "High Risk",
        },
        "disclaimer": "Preliminary symptom-triage guidance, not a definitive diagnosis. Always consult a Primary Health Centre (PHC) medical officer for clinical confirmation.",
        "urgent_guidance": "IMMEDIATE URGENT CARE REQUIRED: Do not delay. Keep patient sitting upright or in recovery position, ensure airway is clear, prepare for immediate emergency transport to the nearest hospital, or activate 108 Emergency Ambulance.",
        "summaries": {
            "mild": "Reported symptoms are consistent with a mild, self-limiting condition. No acute emergency red flags detected. Recommended home monitoring and safe supportive care.",
            "moderate": "Symptoms indicate a moderate infection or persistent illness that warrants clinical evaluation. Referral to Primary Health Centre (PHC) within 24 hours is recommended.",
            "severe": "Symptoms indicate a potentially critical condition requiring immediate medical intervention. Urgent hospital transfer or medical officer review required.",
        },
        "actions": {
            "mild": "Advise rest, adequate oral fluids, and monitoring for 48 hours. Instruct to re-check or visit PHC immediately if high fever, breathlessness, or persistent vomiting develops.",
            "moderate": "Refer patient to the nearest Primary Health Centre (PHC) for clinical assessment and diagnostic workup within 24 hours. Ensure patient stays hydrated and rested.",
            "severe": "Initiate emergency triage: keep patient calm and in a safe position. Do not administer oral liquids if semi-conscious. Transfer immediately to emergency facility or call 108.",
        },
        "medicines": {
            "mild": [
                "Paracetamol 500mg (as needed for fever/headache, max 3 times daily)",
                "Oral Rehydration Salts (ORS) solution for hydration",
                "Steam inhalation twice daily for respiratory relief",
                "Warm fluids, nutritious food, and adequate rest",
            ],
            "moderate": [
                "Paracetamol 500mg for fever or body ache (as prescribed/needed)",
                "Oral Rehydration Salts (ORS) solution with frequent small sips",
                "Cetirizine 10mg (once at bedtime if allergic symptoms / rhinitis present)",
                "Avoid unprescribed antibiotics; seek PHC medical officer prescription",
            ],
            "severe": [
                "Do NOT self-medicate with unprescribed drugs",
                "Keep patient calm, monitor breathing and pulse rate",
                "Maintain clear airway and protect from falls or injury",
                "Prepare patient records and arrange immediate hospital transport",
            ],
        },
    },
    "hi": {
        "levels": {
            "mild": "कम जोखिम (Low Risk)",
            "moderate": "मध्यम जोखिम (Medium Risk)",
            "severe": "उच्च जोखिम (High Risk)",
        },
        "disclaimer": "यह परिणाम प्रारंभिक लक्षण-ट्राइएज मार्गदर्शन है, कोई अंतिम नैदानिक पुष्टि नहीं। पुष्टि के लिए हमेशा प्राथमिक स्वास्थ्य केंद्र (PHC) के चिकित्सा अधिकारी से सलाह लें।",
        "urgent_guidance": "तत्काल आपातकालीन देखभाल आवश्यक: देरी न करें। मरीज को स्थिर रखें, सांस की निगरानी करें, नजदीकी अस्पताल ले जाने की व्यवस्था करें या 108 एम्बुलेंस बुलाएं।",
        "summaries": {
            "mild": "लक्षण सामान्य और हल्के हैं। कोई आपातकालीन चेतावनी संकेत नहीं मिले हैं। घर पर आराम, पर्याप्त पानी और प्राथमिक देखभाल की सलाह दी जाती है।",
            "moderate": "लक्षण संक्रमण या लगातार अस्वस्थता की ओर संकेत करते हैं। 24 घंटे के भीतर प्राथमिक स्वास्थ्य केंद्र (PHC) में क्लिनिकल जांच कराने की आवश्यकता है।",
            "severe": "लक्षण गंभीर स्थिति की ओर संकेत करते हैं। तुरंत चिकित्सकीय सहायता और आपातकालीन अस्पताल रेफरल की आवश्यकता है।",
        },
        "actions": {
            "mild": "48 घंटे तक आराम, भरपूर पानी/तरल पदार्थ और निगरानी की सलाह दें। लक्षण बढ़ने पर तुरंत PHC ले जाएं।",
            "moderate": "मरीज को 24 घंटे के भीतर नजदीकी प्राथमिक स्वास्थ्य केंद्र (PHC) में डॉक्टर की जांच के लिए भेजें।",
            "severe": "आपातकालीन प्रक्रिया शुरू करें: मरीज को शांत रखें, सांस की निगरानी करें और तुरंत अस्पताल पहुंचाने की व्यवस्था करें।",
        },
        "medicines": {
            "mild": [
                "पैरासिटामोल 500mg (बुखार या सिरदर्द होने पर, दिन में अधिकतम 3 बार)",
                "ओआरएस (ORS) घोल पर्याप्त मात्रा में लें",
                "दिन में दो बार भाप लें (सर्दी-खांसी होने पर)",
                "गुनगुना पानी और पौष्टिक हल्का भोजन",
            ],
            "moderate": [
                "पैरासिटामोल 500mg बुखार/दर्द के लिए",
                "ओआरएस (ORS) घोल लगातार छोटे घूंट में लें",
                "सिटिरिज़िन 10mg (एलर्जी या नाक बहने पर रात में)",
                "बिना डॉक्टर की सलाह के एंटीबायोटिक न लें; PHC में जांच कराएं",
            ],
            "severe": [
                "स्वयं कोई दवाई न दें",
                "मरीज को शांत रखें और सांस व नाड़ी की निगरानी करें",
                "श्वास मार्ग खुला रखें",
                "तुरंत 108 एम्बुलेंस बुलाएं या अस्पताल ले जाएं",
            ],
        },
    },
    "mr": {
        "levels": {
            "mild": "कमी जोखीम (Low Risk)",
            "moderate": "मध्यम जोखीम (Medium Risk)",
            "severe": "उच्च जोखीम (High Risk)",
        },
        "disclaimer": "हा निकाल प्राथमिक लक्षण-ट्राइएज मार्गदर्शन आहे, अंतिम वैद्यकीय निदान नाही. पुष्टीकरणासाठी नेहमी प्राथमिक आरोग्य केंद्राच्या (PHC) वैद्यकीय अधिकाऱ्यांचा सल्ला घ्या.",
        "urgent_guidance": "तातडीने आपत्कालीन वैद्यकीय उपचारांची आवश्यकता: उशीर करू नका. रुग्णाला शांत ठेवा, श्वसनमार्गावर लक्ष ठेवा आणि जवळच्या रुग्णालयात तातडीने हलवा किंवा 108 रुग्णवाहिका बोलवा.",
        "summaries": {
            "mild": "लक्षणे सौम्य आणि सामान्य आहेत. कोणतीही आपत्कालीन लक्षणे आढळलेली नाहीत. घरी विश्रांती, भरपूर पाणी आणि काळजी घेण्याचा सल्ला दिला जातो.",
            "moderate": "लक्षणे संसर्ग किंवा दीर्घ आजार दर्शवतात. 24 तासांच्या आत प्राथमिक आरोग्य केंद्रात (PHC) डॉक्टरांकडून तपासणी करून घेणे आवश्यक आहे.",
            "severe": "लक्षणे गंभीर परिस्थिती दर्शवतात. तातडीने वैद्यकीय उपचारांची आणि तातडीने रुग्णालयात हलवण्याची आवश्यकता आहे.",
        },
        "actions": {
            "mild": "48 तास विश्रांती, भरपूर कोमट पाणी आणि देखरेखीचा सल्ला द्या. लक्षणे वाढल्यास त्वरित PHC ला भेट द्या.",
            "moderate": "रुग्णाला 24 तासांच्या आत जवळच्या प्राथमिक आरोग्य केंद्रात (PHC) वैद्यकीय तपासणीसाठी पाठवा.",
            "severe": "उशीर करू नका. रुग्णाला शांत ठेवा आणि त्वरित 108 रुग्णवाहिकेद्वारे रुग्णालयात हलवण्याची व्यवस्था करा.",
        },
        "medicines": {
            "mild": [
                "पॅरासिटामॉल 500mg (ताप किंवा अंगदुखी असल्यास, दिवसातून कमाल 3 वेळा)",
                "ओआरएस (ORS) द्रावण डिहायड्रेशन टाळण्यासाठी",
                "दिवसातून दोनदा पाण्याची वाफ घ्या",
                "भरपूर विश्रांती आणि कोमट पाणी",
            ],
            "moderate": [
                "पॅरासिटामॉल 500mg ताप/दुखण्यासाठी",
                "ओआरएस (ORS) द्रावण वारंवार थोडे थोडे प्यावे",
                "सिटिरिझिन 10mg (सर्दी/अ‍ॅलर्जी असल्यास रात्री)",
                "डॉक्टरांच्या सल्ल्याशिवाय अँटीबायोटिक्स घेऊ नका; PHC ला भेट द्या",
            ],
            "severe": [
                "स्वतःहून कोणतेही औषध देऊ नका",
                "रुग्णाला शांत ठेवा आणि श्वासोच्छ्वासावर लक्ष ठेवा",
                "श्वसनमार्ग मोकळा ठेवा",
                "तातडीने 108 रुग्णवाहिका बोलवून रुग्णालयात हलवा",
            ],
        },
    },
}


async def evaluate_symptom_triage(
    request: SymptomAnalysisRequest,
    current_user: Optional[Dict[str, Any]] = None,
) -> SymptomAnalysisResponse:
    """
    Evidence-based clinical symptom triage and risk assessment engine.
    - Validates symptoms text.
    - Resolves patient document from MongoDB if patient_id is provided.
    - Incorporates chronic conditions, age risk factors, and duration.
    - Scans for emergency red-flag symptoms with automatic escalation.
    - Localizes clinical summary, recommended actions, and safe supportive care in EN/HI/MR.
    - Associates analysis with patient record in MongoDB.
    """
    symptoms_text = request.symptoms.strip()
    if not symptoms_text or len(symptoms_text) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Symptoms description cannot be empty. Please provide patient symptoms or clinical complaints.",
        )

    # 1. Resolve Patient Context if provided
    patient_doc = None
    patient_name = None
    patient_village = None
    patient_chronic_conditions = []
    patient_allergies = []
    patient_age = None

    if request.patient_id:
        patients_col = get_collection(COLLECTION_PATIENTS)
        if patients_col is not None:
            pid = request.patient_id.strip()
            # Support patient_id string (e.g. "P-4559") or MongoDB ObjectId
            patient_doc = await patients_col.find_one({"$or": [{"patient_id": pid}, {"id": pid}]})
            if not patient_doc and len(pid) == 24:
                try:
                    from bson import ObjectId
                    patient_doc = await patients_col.find_one({"_id": ObjectId(pid)})
                except Exception:
                    pass

            if patient_doc:
                patient_name = patient_doc.get("full_name") or patient_doc.get("name") or f"Patient {pid}"
                patient_village = patient_doc.get("village")
                patient_chronic_conditions = patient_doc.get("chronic_conditions") or []
                patient_allergies = patient_doc.get("allergies") or []
                patient_age = patient_doc.get("age")

    # 2. Check for Emergency Red Flags
    has_red_flag = bool(RED_FLAG_REGEX.search(symptoms_text))

    # 3. Assess Duration and Base Severity
    duration_key = (request.duration or "").lower().strip()
    reported_severity = (request.severity or "mild").lower().strip()

    is_prolonged = duration_key in [">2w", "more-than-week", "1-2w", "4-7d"]

    # Check high-risk patient factors
    has_high_risk_comorbidity = False
    if patient_chronic_conditions:
        comorb_text = " ".join(patient_chronic_conditions).lower()
        if any(c in comorb_text for c in ["asthma", "copd", "heart", "cardiac", "diabetes", "hypertension", "kidney"]):
            has_high_risk_comorbidity = True

    is_extreme_age = patient_age is not None and (patient_age < 2 or patient_age > 65)

    # 4. Determine Clinical Severity Category & Urgency
    if has_red_flag or reported_severity == "severe":
        final_severity = "severe"
        refer = True
        emergency = True
        accent = "red"
        confidence = 92 if has_red_flag else 88
    elif reported_severity == "moderate" or is_prolonged or (has_high_risk_comorbidity and reported_severity != "mild") or is_extreme_age:
        final_severity = "moderate"
        refer = True
        emergency = False
        accent = "amber"
        confidence = 84 if is_prolonged else 78
    else:
        final_severity = "mild"
        refer = False
        emergency = False
        accent = "emerald"
        confidence = 86

    # 5. Extract Language Specific Content
    lang = request.language if request.language in TRIAGE_CONTENT else "en"
    content = TRIAGE_CONTENT[lang]

    level_str = content["levels"][final_severity]
    summary_str = content["summaries"][final_severity]
    action_str = content["actions"][final_severity]
    medicines_list = list(content["medicines"][final_severity])
    urgent_care_guidance = content["urgent_guidance"] if (emergency or final_severity == "severe") else None

    # Enrich summary with patient details if available
    if patient_name:
        if lang == "hi":
            summary_str = f"मरीज: {patient_name} ({request.patient_id})। " + summary_str
        elif lang == "mr":
            summary_str = f"रुग्ण: {patient_name} ({request.patient_id}). " + summary_str
        else:
            summary_str = f"Assessed for patient {patient_name} ({request.patient_id}). " + summary_str

        if has_high_risk_comorbidity and final_severity != "mild":
            if lang == "hi":
                summary_str += f" ध्यान दें: पूर्व-मौजूद स्थिति ({', '.join(patient_chronic_conditions)}) के कारण अतिरिक्त सतर्कता आवश्यक है।"
            elif lang == "mr":
                summary_str += f" नोंद: आधीच्या आजारामुळे ({', '.join(patient_chronic_conditions)}) विशेष काळजी घेणे आवश्यक आहे."
            else:
                summary_str += f" Note: Pre-existing condition ({', '.join(patient_chronic_conditions)}) elevates clinical monitoring priority."

    # 6. Check allergies against suggested medicines
    if patient_allergies:
        allergy_str = " ".join(patient_allergies).lower()
        if "paracetamol" in allergy_str or "acetaminophen" in allergy_str:
            medicines_list = [m for m in medicines_list if "paracetamol" not in m.lower() and "पैरासिटामोल" not in m and "पॅरासिटामॉल" not in m]

    # 7. Persist Assessment to MongoDB if associated with a patient
    now = datetime.now(timezone.utc)
    analysis_id = f"TRIAGE-{random.randint(1000, 9999)}"

    if request.patient_id:
        symptoms_col = get_collection(COLLECTION_SYMPTOMS)
        if symptoms_col is not None:
            try:
                # Save as a verified triage assessment record
                symptom_doc = {
                    "symptom_id": f"SYM-{random.randint(1000, 9999)}",
                    "analysis_id": analysis_id,
                    "patient_id": request.patient_id,
                    "patient_name": patient_name or f"Patient {request.patient_id}",
                    "symptoms": [s.strip() for s in symptoms_text.split(",") if s.strip()] or [symptoms_text[:50]],
                    "description": symptoms_text,
                    "severity": final_severity,
                    "duration": duration_key or "today",
                    "status": "reported",
                    "triage_level": level_str,
                    "refer_recommended": refer,
                    "emergency_escalated": emergency,
                    "submitted_by": (current_user.get("role") if current_user else "asha") or "asha",
                    "submitted_by_id": current_user.get("worker_id") if current_user else None,
                    "notes": f"AI Triage Assessment ({level_str}): {summary_str[:120]}",
                    "recorded_at": now,
                    "created_at": now,
                    "updated_at": now,
                }
                if request.offline_id:
                    symptom_doc["offline_id"] = request.offline_id

                await symptoms_col.insert_one(symptom_doc)
            except Exception as e:
                # Non-fatal if recording fails
                pass

    return SymptomAnalysisResponse(
        analysis_id=analysis_id,
        level=level_str,
        severity=final_severity,
        accent=accent,
        confidence=confidence,
        summary=summary_str,
        action=action_str,
        medicines=medicines_list,
        refer=refer,
        emergency=emergency,
        urgent_care_guidance=urgent_care_guidance,
        disclaimer=content["disclaimer"],
        patient_id=request.patient_id,
        patient_name=patient_name,
        village=patient_village,
        engine="rule_based_clinical_triage",
        external_ai_configured=False,
        created_at=now,
    )
