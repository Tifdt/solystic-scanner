import { useState, useRef, useEffect, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────
//  SYSTEM PROMPT — ARIA
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es ARIA — Assistant de Réparation IA, expert niveau 3 en maintenance des machines de tri postal Solystic TGF-MTI-12, utilisées au PIC La Poste Saint-Priest.

Tu combines l'expertise d'un technicien terrain senior ET d'un ingénieur industriel de haut niveau. Tu guides le technicien pas à pas en analysant chaque photo qu'il t'envoie — qu'il s'agisse d'un écran, d'un composant interne, d'un câblage, d'un module ou de toute autre partie de la machine.

══ PREMIER MESSAGE — DIAGNOSTIC INITIAL ══
Réponds UNIQUEMENT avec un objet JSON valide (sans texte avant ni après) :
{
  "type": "diagnostic",
  "code_erreur": "string ou null",
  "sous_systeme": "string",
  "indicateurs": {
    "vitesse": "string ou null",
    "efficacite": "string ou null",
    "plis_depiles": "string ou null",
    "recirculation_haut": "string ou null",
    "recirculation_bas": "string ou null",
    "tri_cumule": "string ou null"
  },
  "score_criticite": 0,
  "statut": "NORMAL",
  "diagnostic": "Description précise et technique de ce que montre la photo.",
  "cause_probable": "Explication technique de la cause probable.",
  "impact_estime": "Impact concret sur le traitement du courrier.",
  "securite": ["Consigne de sécurité obligatoire"],
  "outils_necessaires": ["Outil ou équipement nécessaire"],
  "temps_estime": "X-Y minutes",
  "etapes_intervention": [
    {
      "numero": 1,
      "titre": "Titre de l'étape",
      "description": "Description très détaillée, pas à pas.",
      "attention": "Point d'attention critique ou null"
    }
  ],
  "verification_finale": ["Vérification à effectuer"],
  "action_preventive": "Action préventive recommandée.",
  "escalade": "Dans quelle situation escalader et vers qui."
}

Règles diagnostic :
- score_criticite : 0 (normal) à 10 (arrêt machine immédiat)
- statut : "NORMAL" | "ATTENTION" | "CRITIQUE" | "URGENCE"
- etapes_intervention : minimum 4, maximum 12 étapes
- Si la photo montre l'intérieur de la machine, analyser les composants visibles (câblage, courroies, capteurs, moteurs, cartes électroniques, etc.)

══ MESSAGES SUIVANTS — SUIVI D'INTERVENTION ══
Analyse la photo envoyée dans le contexte de l'intervention en cours.
Réponds UNIQUEMENT avec un objet JSON valide :
{
  "type": "suivi",
  "statut_etape": "CORRECT",
  "observation": "Description précise de ce que tu vois sur la photo.",
  "validation": "Confirmation ou correction de l'étape réalisée.",
  "prochaine_action": "Instruction claire et précise pour la suite.",
  "points_attention": ["Point important à vérifier"],
  "alerte": "Message d'urgence si danger détecté, ou null",
  "progression": 25
}

Règles suivi :
- statut_etape : "CORRECT" (étape bien réalisée) | "INCORRECT" (erreur détectée) | "PARTIEL" (incomplet) | "ATTENTION" (risque identifié)
- progression : estimation d'avancement en pourcentage (0-100)
- Si danger immédiat détecté : statut_etape = "ATTENTION" ET alerte = message d'urgence précis
- Toujours encourager le technicien et expliquer clairement la prochaine action

Règles générales :
- Toujours répondre en JSON valide uniquement, sans texte autour
- Rédiger en français, de manière claire, technique et bienveillante
- S'adapter au niveau visible sur les photos (écran HMI, composant interne, module électronique, etc.)`

// ─────────────────────────────────────────────────────────────
//  API
// ─────────────────────────────────────────────────────────────
async function callAI(apiHistory, apiKey) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...apiHistory,
      ],
    }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Erreur API ${resp.status}`)
  }

  const data = await resp.json()
  const text = data.choices?.[0]?.message?.content || '{}'
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Réponse ARIA non parsable')
  return JSON.parse(match[0])
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

function nowStr() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

// ─────────────────────────────────────────────────────────────
//  STATUS CONFIG
// ─────────────────────────────────────────────────────────────
const STATUT_CFG = {
  NORMAL:    { color: '#4ade80', bg: 'rgba(74,222,128,0.06)',  border: '#166534', label: 'NORMAL'    },
  ATTENTION: { color: '#fbbf24', bg: 'rgba(251,191,36,0.06)', border: '#92400e', label: 'ATTENTION' },
  CRITIQUE:  { color: '#f87171', bg: 'rgba(248,113,113,0.06)',border: '#991b1b', label: 'CRITIQUE'  },
  URGENCE:   { color: '#c084fc', bg: 'rgba(192,132,252,0.06)',border: '#6b21a8', label: 'URGENCE'   },
  CORRECT:   { color: '#4ade80', bg: 'rgba(74,222,128,0.06)',  border: '#166534', label: 'CORRECT'   },
  INCORRECT: { color: '#f87171', bg: 'rgba(248,113,113,0.06)',border: '#991b1b', label: 'INCORRECT' },
  PARTIEL:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.06)', border: '#92400e', label: 'PARTIEL'   },
}

// ─────────────────────────────────────────────────────────────
//  DIAGNOSTIC CARD (premier message)
// ─────────────────────────────────────────────────────────────
function DiagnosticCard({ data }) {
  const cfg = STATUT_CFG[data.statut] || STATUT_CFG.NORMAL
  const ind = data.indicateurs || {}
  const hasIndicators = Object.values(ind).some(v => v !== null)

  return (
    <div className="ai-card diagnostic-card" style={{ borderColor: cfg.border }}>

      {/* En-tête statut */}
      <div className="dc-header" style={{ background: cfg.bg, borderColor: cfg.border }}>
        <div className="dc-header-left">
          <div className="status-dot" style={{ background: cfg.color, boxShadow: `0 0 8px ${cfg.color}` }} />
          <span className="status-label" style={{ color: cfg.color }}>{cfg.label}</span>
          <div className="dc-divider" />
          <span className="crit-label">CRITICITÉ</span>
          <span className="crit-val" style={{ color: cfg.color }}>{data.score_criticite}<span className="crit-max">/10</span></span>
        </div>
        <div className="dc-header-right">
          {data.code_erreur && (
            <span className="badge-err">{data.code_erreur}</span>
          )}
          {data.temps_estime && (
            <span className="badge-time">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {data.temps_estime}
            </span>
          )}
        </div>
      </div>

      {/* Sous-système */}
      {data.sous_systeme && (
        <div className="dc-subsystem">
          <span className="dc-sub-label">SOUS-SYSTÈME</span>
          <span className="dc-sub-val">{data.sous_systeme}</span>
        </div>
      )}

      {/* Diagnostic */}
      <div className="dc-block">
        <div className="dc-block-tag">DIAGNOSTIC</div>
        <p className="dc-text">{data.diagnostic}</p>
      </div>

      {/* Cause / Impact */}
      <div className="dc-two-col">
        <div className="dc-block">
          <div className="dc-block-tag">CAUSE PROBABLE</div>
          <p className="dc-text">{data.cause_probable}</p>
        </div>
        <div className="dc-block">
          <div className="dc-block-tag">IMPACT SUR LE TRI</div>
          <p className="dc-text">{data.impact_estime}</p>
        </div>
      </div>

      {/* Indicateurs */}
      {hasIndicators && (
        <div className="dc-block">
          <div className="dc-block-tag">INDICATEURS MACHINE</div>
          <div className="indicators-grid">
            {Object.entries(ind).map(([k, v]) => v !== null && (
              <div key={k} className="indicator">
                <span className="ind-label">{k.replace(/_/g, ' ').toUpperCase()}</span>
                <span className="ind-value">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sécurité */}
      {data.securite?.length > 0 && (
        <div className="dc-block dc-securite">
          <div className="dc-block-tag warn">⚠ SÉCURITÉ — OBLIGATOIRE AVANT INTERVENTION</div>
          <ul className="list-securite">
            {data.securite.map((s, i) => (
              <li key={i}>
                <span className="sec-index">{String(i + 1).padStart(2, '0')}</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Outils */}
      {data.outils_necessaires?.length > 0 && (
        <div className="dc-block">
          <div className="dc-block-tag">ÉQUIPEMENTS REQUIS</div>
          <div className="outils-grid">
            {data.outils_necessaires.map((o, i) => (
              <div key={i} className="outil-item">
                <span className="outil-index">{String(i + 1).padStart(2, '0')}</span>
                {o}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Étapes */}
      {data.etapes_intervention?.length > 0 && (
        <div className="dc-block">
          <div className="dc-block-tag">PROCÉDURE D'INTERVENTION</div>
          <div className="etapes-list">
            {data.etapes_intervention.map((e) => (
              <div key={e.numero} className="etape-card">
                <div className="etape-num">
                  <span>{String(e.numero).padStart(2, '0')}</span>
                </div>
                <div className="etape-body">
                  <div className="etape-titre">{e.titre.toUpperCase()}</div>
                  <p className="etape-desc">{e.description}</p>
                  {e.attention && (
                    <div className="etape-attention">
                      <span className="attention-tag">ATTENTION</span>
                      {e.attention}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vérification finale */}
      {data.verification_finale?.length > 0 && (
        <div className="dc-block">
          <div className="dc-block-tag">VÉRIFICATION FINALE</div>
          <ul className="list-verif">
            {data.verification_finale.map((v, i) => (
              <li key={i}>
                <input type="checkbox" id={`vf-${genId()}`} />
                <label>{v}</label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Préventif / Escalade */}
      {(data.action_preventive || data.escalade) && (
        <div className="dc-two-col">
          {data.action_preventive && (
            <div className="bottom-card preventif">
              <div className="bottom-card-tag">ACTION PRÉVENTIVE</div>
              <p>{data.action_preventive}</p>
            </div>
          )}
          {data.escalade && (
            <div className="bottom-card escalade">
              <div className="bottom-card-tag">ESCALADE TECHNIQUE</div>
              <p>{data.escalade}</p>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  SUIVI CARD (messages de suivi)
// ─────────────────────────────────────────────────────────────
function SuiviCard({ data }) {
  const cfg = STATUT_CFG[data.statut_etape] || STATUT_CFG.ATTENTION
  const prog = Math.min(100, Math.max(0, data.progression || 0))

  return (
    <div className="ai-card suivi-card" style={{ borderColor: cfg.border }}>

      {/* Alerte urgente */}
      {data.alerte && (
        <div className="suivi-alerte">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {data.alerte}
        </div>
      )}

      {/* Statut + progression */}
      <div className="suivi-header" style={{ background: cfg.bg, borderColor: cfg.border }}>
        <div className="suivi-status">
          <div className="status-dot" style={{ background: cfg.color, boxShadow: `0 0 8px ${cfg.color}` }} />
          <span className="status-label" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
        <div className="suivi-prog-wrap">
          <span className="prog-label">AVANCEMENT</span>
          <div className="prog-bar">
            <div className="prog-fill" style={{ width: `${prog}%`, background: cfg.color }} />
          </div>
          <span className="prog-pct" style={{ color: cfg.color }}>{prog}%</span>
        </div>
      </div>

      {/* Corps */}
      <div className="suivi-body">
        <div className="suivi-row">
          <div className="suivi-row-label">OBSERVATION</div>
          <p>{data.observation}</p>
        </div>
        <div className="suivi-row">
          <div className="suivi-row-label">VALIDATION</div>
          <p>{data.validation}</p>
        </div>
        <div className="suivi-row suivi-next">
          <div className="suivi-row-label next-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            PROCHAINE ACTION
          </div>
          <p>{data.prochaine_action}</p>
        </div>
        {data.points_attention?.length > 0 && (
          <div className="suivi-row">
            <div className="suivi-row-label">POINTS D'ATTENTION</div>
            <ul className="suivi-attention-list">
              {data.points_attention.map((p, i) => (
                <li key={i}>
                  <span className="suivi-dot" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages]       = useState([])
  const [apiHistory, setApiHistory]   = useState([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [phase, setPhase]             = useState('ATTENTE') // ATTENTE | INTERVENTION | TERMINE
  const [inputImage, setInputImage]   = useState(null)      // { file, preview, base64, mimeType }
  const [inputText, setInputText]     = useState('')
  const [dragging, setDragging]       = useState(false)

  const fileRef   = useRef(null)
  const bottomRef = useRef(null)
  const textRef   = useRef(null)

  // Auto-scroll vers le bas
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Gestion fichier ──
  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setError(null)
    const preview = URL.createObjectURL(file)
    const base64  = await fileToBase64(file)
    setInputImage({ file, preview, base64, mimeType: file.type })
    textRef.current?.focus()
  }, [])

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  // ── Envoi message ──
  async function handleSend() {
    const apiKey = import.meta.env.VITE_OPENAI_KEY
    if (!apiKey || apiKey === 'METS_MA_CLE_ICI') {
      setError('Clé API OpenAI manquante dans .env (VITE_OPENAI_KEY)')
      return
    }
    if (!inputImage && !inputText.trim()) return

    const caption     = inputText.trim()
    const isFirst     = messages.length === 0
    const userMsgId   = genId()

    // Message UI utilisateur
    const userMsg = {
      id:           userMsgId,
      role:         'user',
      imagePreview: inputImage?.preview || null,
      caption:      caption || null,
      timestamp:    nowStr(),
    }

    // Contenu API
    const apiContent = []
    if (inputImage) {
      apiContent.push({
        type:      'image_url',
        image_url: { url: `data:${inputImage.mimeType};base64,${inputImage.base64}` },
      })
    }
    apiContent.push({
      type: 'text',
      text: caption || (isFirst
        ? 'Analyse cette image et génère le diagnostic initial complet.'
        : 'Voici une photo de mon intervention. Analyse et guide-moi pour la suite.'),
    })

    const newApiHistory = [...apiHistory, { role: 'user', content: apiContent }]

    setMessages(prev => [...prev, userMsg])
    setInputImage(null)
    setInputText('')
    setLoading(true)
    setError(null)

    try {
      const result = await callAI(newApiHistory, apiKey)

      const updatedApiHistory = [
        ...newApiHistory,
        { role: 'assistant', content: JSON.stringify(result) },
      ]
      setApiHistory(updatedApiHistory)

      setMessages(prev => [...prev, {
        id:        genId(),
        role:      'ai',
        data:      result,
        timestamp: nowStr(),
      }])

      if (isFirst) setPhase('INTERVENTION')

      // Auto-marquer terminé si progression 100%
      if (result.type === 'suivi' && result.progression >= 100) {
        setPhase('TERMINE')
      }

    } catch (e) {
      setError(e.message)
      setMessages(prev => prev.filter(m => m.id !== userMsgId))
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setMessages([])
    setApiHistory([])
    setPhase('ATTENTE')
    setInputImage(null)
    setInputText('')
    setError(null)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <header className="shell-header">
        <div className="hdr-left">
          <div className="hdr-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
          </div>
          <div>
            <div className="hdr-title">SOLYSTIC SCANNER</div>
            <div className="hdr-sub">ARIA — ASSISTANT IA · TGF-MTI-12 · PIC LA POSTE SAINT-PRIEST</div>
          </div>
        </div>

        <div className="hdr-right">
          <div className={`phase-pill phase-${phase.toLowerCase()}`}>
            <span className="phase-dot" />
            {phase === 'ATTENTE'      && 'EN ATTENTE'}
            {phase === 'INTERVENTION' && 'INTERVENTION EN COURS'}
            {phase === 'TERMINE'      && 'INTERVENTION TERMINÉE'}
          </div>
          <a href="https://faloria-co.com" target="_blank" rel="noopener noreferrer" className="faloria-link">
            FALORIA &amp; Co
          </a>
          {messages.length > 0 && (
            <button className="btn-print" onClick={() => window.print()} title="Imprimer la session">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
            </button>
          )}
          {phase !== 'ATTENTE' && (
            <button className="btn-reset" onClick={handleReset} title="Nouvelle session">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.1"/>
              </svg>
              NOUVELLE SESSION
            </button>
          )}
        </div>
      </header>

      {/* ══ CONVERSATION ════════════════════════════════════════ */}
      <main className="shell-conv">

        {/* ── Écran d'accueil ── */}
        {messages.length === 0 && (
          <div className="welcome-screen">
            <div className="welcome-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h1 className="welcome-title">Bonjour, je suis ARIA</h1>
            <p className="welcome-desc">
              Votre assistant de réparation IA — Technicien senior &amp; Ingénieur industriel.<br />
              Envoyez une photo de l'écran, d'un composant ou de l'intérieur de la machine<br />
              pour démarrer le diagnostic et être guidé tout au long de votre intervention.
            </p>
            <div className="welcome-features">
              <div className="feat-item">
                <div className="feat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
                <div>
                  <div className="feat-title">Photo écran & intérieur</div>
                  <div className="feat-desc">Analyse n'importe quelle partie de la machine</div>
                </div>
              </div>
              <div className="feat-item">
                <div className="feat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>
                <div>
                  <div className="feat-title">Diagnostic IA instantané</div>
                  <div className="feat-desc">GPT-4o Vision analyse et diagnostique en temps réel</div>
                </div>
              </div>
              <div className="feat-item">
                <div className="feat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                </div>
                <div>
                  <div className="feat-title">Guidage étape par étape</div>
                  <div className="feat-desc">Procédure complète adaptée à votre situation</div>
                </div>
              </div>
              <div className="feat-item">
                <div className="feat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <div>
                  <div className="feat-title">Suivi de progression</div>
                  <div className="feat-desc">Envoyez des photos pendant la réparation pour un suivi IA</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        {messages.map((msg) => (
          <div key={msg.id} className={`msg-row msg-row--${msg.role}`}>

            {msg.role === 'user' && (
              <div className="user-bubble">
                {msg.imagePreview && (
                  <div className="user-img-wrap">
                    <img src={msg.imagePreview} alt="Photo envoyée" className="user-img" />
                    <div className="user-img-badge">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      PHOTO ENVOYÉE
                    </div>
                  </div>
                )}
                {msg.caption && <p className="user-caption">{msg.caption}</p>}
                <div className="msg-time">{msg.timestamp}</div>
              </div>
            )}

            {msg.role === 'ai' && (
              <div className="ai-bubble">
                <div className="ai-avatar">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                  </svg>
                </div>
                <div className="ai-content">
                  {msg.data?.type === 'diagnostic' && <DiagnosticCard data={msg.data} />}
                  {msg.data?.type === 'suivi'      && <SuiviCard      data={msg.data} />}
                  <div className="msg-time">{msg.timestamp} · ARIA</div>
                </div>
              </div>
            )}

          </div>
        ))}

        {/* ── Loader ── */}
        {loading && (
          <div className="msg-row msg-row--ai">
            <div className="ai-bubble">
              <div className="ai-avatar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                </svg>
              </div>
              <div className="loading-bubble">
                <div className="typing-dots">
                  <span /><span /><span />
                </div>
                <span className="loading-text">ARIA analyse votre photo...</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Erreur ── */}
        {error && (
          <div className="error-row">
            <span className="alert-tag">ERREUR SYSTÈME</span>
            {error}
          </div>
        )}

        <div ref={bottomRef} style={{ height: 1 }} />
      </main>

      {/* ══ BARRE D'INPUT ═══════════════════════════════════════ */}
      <footer className="shell-input">
        {/* Aperçu image sélectionnée */}
        {inputImage && (
          <div className="input-preview-bar">
            <div className="input-preview-thumb">
              <img src={inputImage.preview} alt="Aperçu" />
              <button
                className="input-preview-remove"
                onClick={() => setInputImage(null)}
                title="Supprimer"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <span className="input-preview-name">{inputImage.file.name}</span>
          </div>
        )}

        {/* Zone d'input principale */}
        <div
          className={`input-row${dragging ? ' input-row--drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <button
            className="btn-photo"
            onClick={() => fileRef.current?.click()}
            title="Ajouter une photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>

          <input
            ref={textRef}
            type="text"
            className="text-input"
            placeholder={
              phase === 'ATTENTE'
                ? 'Décrivez le problème ou glissez une photo...'
                : 'Décrivez ce que vous faites, posez une question...'
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <button
            className="btn-send"
            onClick={handleSend}
            disabled={loading || (!inputImage && !inputText.trim())}
          >
            {loading ? (
              <span className="spinner-send" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />

        <div className="input-hint">
          {dragging
            ? 'Relâchez pour ajouter la photo'
            : 'Glissez-déposez une photo · Entrée pour envoyer · Photo + texte possible'}
        </div>
      </footer>

    </div>
  )
}
