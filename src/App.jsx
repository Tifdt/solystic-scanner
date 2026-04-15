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

Règles : score_criticite 0-10, statut NORMAL|ATTENTION|CRITIQUE|URGENCE, 4-12 étapes.

══ MESSAGES SUIVANTS — SUIVI ══
{
  "type": "suivi",
  "statut_etape": "CORRECT",
  "observation": "string",
  "validation": "string",
  "prochaine_action": "string",
  "points_attention": ["string"],
  "alerte": "string ou null",
  "progression": 25
}

statut_etape : CORRECT | INCORRECT | PARTIEL | ATTENTION. progression : 0-100.
Règles : JSON valide uniquement. Français. Technique et précis. Si danger : statut_etape=ATTENTION + alerte non null.`

// ─────────────────────────────────────────────────────────────
//  API
// ─────────────────────────────────────────────────────────────
async function callAI(apiHistory, apiKey) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2500,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...apiHistory],
    }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err?.error?.message || `ERR_API_${resp.status}`)
  }
  const data = await resp.json()
  const text = data.choices?.[0]?.message?.content || '{}'
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('PARSE_ERROR: réponse ARIA corrompue')
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
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function genId() { return Math.random().toString(36).slice(2, 10) }

// ─────────────────────────────────────────────────────────────
//  STATUS CONFIG — terminal colors
// ─────────────────────────────────────────────────────────────
const STATUT_CFG = {
  NORMAL:    { color: '#00ff41', bg: 'rgba(0,255,65,0.06)',    border: '#00aa22', label: 'NORMAL'    },
  ATTENTION: { color: '#ffb000', bg: 'rgba(255,176,0,0.06)',  border: '#cc8800', label: 'ATTENTION' },
  CRITIQUE:  { color: '#ff3333', bg: 'rgba(255,51,51,0.06)',  border: '#cc0000', label: 'CRITIQUE'  },
  URGENCE:   { color: '#ff00ff', bg: 'rgba(255,0,255,0.06)',  border: '#aa00aa', label: 'URGENCE'   },
  CORRECT:   { color: '#00ff41', bg: 'rgba(0,255,65,0.06)',    border: '#00aa22', label: 'CORRECT'   },
  INCORRECT: { color: '#ff3333', bg: 'rgba(255,51,51,0.06)',  border: '#cc0000', label: 'INCORRECT' },
  PARTIEL:   { color: '#ffb000', bg: 'rgba(255,176,0,0.06)',  border: '#cc8800', label: 'PARTIEL'   },
}

// ─────────────────────────────────────────────────────────────
//  DIAGNOSTIC CARD
// ─────────────────────────────────────────────────────────────
function DiagnosticCard({ data }) {
  const cfg = STATUT_CFG[data.statut] || STATUT_CFG.NORMAL
  const ind = data.indicateurs || {}
  const hasInd = Object.values(ind).some(v => v !== null)

  return (
    <div className="ai-card diagnostic-card" style={{ borderColor: cfg.border }}>

      {/* Header statut */}
      <div className="dc-header" style={{ background: cfg.bg, borderColor: cfg.border }}>
        <div className="dc-header-left">
          <div className="status-dot pulse" style={{ background: cfg.color, boxShadow: `0 0 10px ${cfg.color}` }} />
          <span className="status-label" style={{ color: cfg.color, textShadow: `0 0 10px ${cfg.color}` }}>
            [{cfg.label}]
          </span>
          <div className="dc-divider" />
          <span className="crit-label">CRITICITE</span>
          <span className="crit-val" style={{ color: cfg.color, textShadow: `0 0 8px ${cfg.color}` }}>
            {data.score_criticite}<span className="crit-max">/10</span>
          </span>
        </div>
        <div className="dc-header-right">
          {data.code_erreur && <span className="badge-err">ERR:{data.code_erreur}</span>}
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
          <span className="dc-sub-label">// SOUS-SYSTEME</span>
          <span className="dc-sub-val">&gt; {data.sous_systeme}</span>
        </div>
      )}

      {/* Diagnostic */}
      <div className="dc-block">
        <div className="dc-block-tag">&gt;_ DIAGNOSTIC</div>
        <p className="dc-text">{data.diagnostic}</p>
      </div>

      {/* Cause / Impact */}
      <div className="dc-two-col">
        <div className="dc-block">
          <div className="dc-block-tag">&gt;_ CAUSE PROBABLE</div>
          <p className="dc-text">{data.cause_probable}</p>
        </div>
        <div className="dc-block">
          <div className="dc-block-tag">&gt;_ IMPACT OPERATIONNEL</div>
          <p className="dc-text">{data.impact_estime}</p>
        </div>
      </div>

      {/* Indicateurs */}
      {hasInd && (
        <div className="dc-block">
          <div className="dc-block-tag">&gt;_ TELEMETRIE MACHINE</div>
          <div className="indicators-grid">
            {Object.entries(ind).map(([k, v]) => v !== null && (
              <div key={k} className="indicator">
                <span className="ind-label">{k.replace(/_/g, '_').toUpperCase()}</span>
                <span className="ind-value">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sécurité */}
      {data.securite?.length > 0 && (
        <div className="dc-block dc-securite">
          <div className="dc-block-tag warn">!! SECURITE — EXECUTION OBLIGATOIRE</div>
          <ul className="list-securite">
            {data.securite.map((s, i) => (
              <li key={i}>
                <span className="sec-index">[{String(i + 1).padStart(2, '0')}]</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Outils */}
      {data.outils_necessaires?.length > 0 && (
        <div className="dc-block">
          <div className="dc-block-tag">&gt;_ EQUIPEMENTS REQUIS</div>
          <div className="outils-grid">
            {data.outils_necessaires.map((o, i) => (
              <div key={i} className="outil-item">
                <span className="outil-index">[{String(i + 1).padStart(2, '0')}]</span>
                {o}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Étapes */}
      {data.etapes_intervention?.length > 0 && (
        <div className="dc-block">
          <div className="dc-block-tag">&gt;_ PROCEDURE INTERVENTION // {data.etapes_intervention.length} ETAPES</div>
          <div className="etapes-list">
            {data.etapes_intervention.map((e) => (
              <div key={e.numero} className="etape-card">
                <div className="etape-num">
                  <span>{String(e.numero).padStart(2, '0')}</span>
                </div>
                <div className="etape-body">
                  <div className="etape-titre">&gt; {e.titre.toUpperCase()}</div>
                  <p className="etape-desc">{e.description}</p>
                  {e.attention && (
                    <div className="etape-attention">
                      <span className="attention-tag">!! ATTENTION</span>
                      {e.attention}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vérification */}
      {data.verification_finale?.length > 0 && (
        <div className="dc-block">
          <div className="dc-block-tag">&gt;_ VERIFICATION FINALE</div>
          <ul className="list-verif">
            {data.verification_finale.map((v, i) => (
              <li key={i}>
                <input type="checkbox" id={`vf-${i}-${genId()}`} />
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
              <div className="bottom-card-tag">&gt;_ ACTION PREVENTIVE</div>
              <p>{data.action_preventive}</p>
            </div>
          )}
          {data.escalade && (
            <div className="bottom-card escalade">
              <div className="bottom-card-tag">&gt;_ ESCALADE TECHNIQUE</div>
              <p>{data.escalade}</p>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  SUIVI CARD
// ─────────────────────────────────────────────────────────────
function SuiviCard({ data }) {
  const cfg = STATUT_CFG[data.statut_etape] || STATUT_CFG.ATTENTION
  const prog = Math.min(100, Math.max(0, data.progression || 0))
  const filled = Math.round(prog / 5)

  return (
    <div className="ai-card suivi-card" style={{ borderColor: cfg.border }}>

      {data.alerte && (
        <div className="suivi-alerte">
          <span className="alerte-prefix">!! ALERTE !! </span>
          {data.alerte}
        </div>
      )}

      <div className="suivi-header" style={{ background: cfg.bg, borderColor: cfg.border }}>
        <div className="suivi-status">
          <div className="status-dot pulse" style={{ background: cfg.color, boxShadow: `0 0 10px ${cfg.color}` }} />
          <span className="status-label" style={{ color: cfg.color, textShadow: `0 0 10px ${cfg.color}` }}>
            [{cfg.label}]
          </span>
        </div>
        <div className="suivi-prog-wrap">
          <span className="prog-label">AVANCEMENT</span>
          <span className="prog-bar-ascii" style={{ color: cfg.color }}>
            [{Array(filled).fill('█').join('')}{Array(20 - filled).fill('░').join('')}]
          </span>
          <span className="prog-pct" style={{ color: cfg.color, textShadow: `0 0 6px ${cfg.color}` }}>
            {prog}%
          </span>
        </div>
      </div>

      <div className="suivi-body">
        <div className="suivi-row">
          <div className="suivi-row-label">// OBSERVATION</div>
          <p>{data.observation}</p>
        </div>
        <div className="suivi-row">
          <div className="suivi-row-label">// VALIDATION</div>
          <p>{data.validation}</p>
        </div>
        <div className="suivi-row suivi-next">
          <div className="suivi-row-label next-label">
            &gt; PROCHAINE ACTION
          </div>
          <p>{data.prochaine_action}</p>
        </div>
        {data.points_attention?.length > 0 && (
          <div className="suivi-row">
            <div className="suivi-row-label">// POINTS ATTENTION</div>
            <ul className="suivi-attention-list">
              {data.points_attention.map((p, i) => (
                <li key={i}><span className="suivi-dot">▶</span>{p}</li>
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
  const [messages, setMessages]     = useState([])
  const [apiHistory, setApiHistory] = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [phase, setPhase]           = useState('ATTENTE')
  const [inputImage, setInputImage] = useState(null)
  const [inputText, setInputText]   = useState('')
  const [dragging, setDragging]     = useState(false)
  const [time, setTime]             = useState(nowStr())

  const fileRef   = useRef(null)
  const bottomRef = useRef(null)
  const textRef   = useRef(null)

  useEffect(() => {
    const t = setInterval(() => setTime(nowStr()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

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

  async function handleSend() {
    const apiKey = import.meta.env.VITE_OPENAI_KEY
    if (!apiKey || apiKey === 'METS_MA_CLE_ICI') {
      setError('ERR_NO_KEY :: VITE_OPENAI_KEY manquante dans .env')
      return
    }
    if (!inputImage && !inputText.trim()) return

    const caption   = inputText.trim()
    const isFirst   = messages.length === 0
    const userMsgId = genId()

    const userMsg = {
      id: userMsgId, role: 'user',
      imagePreview: inputImage?.preview || null,
      caption: caption || null,
      timestamp: nowStr(),
    }

    const apiContent = []
    if (inputImage) {
      apiContent.push({ type: 'image_url', image_url: { url: `data:${inputImage.mimeType};base64,${inputImage.base64}` } })
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
      const updatedApiHistory = [...newApiHistory, { role: 'assistant', content: JSON.stringify(result) }]
      setApiHistory(updatedApiHistory)
      setMessages(prev => [...prev, { id: genId(), role: 'ai', data: result, timestamp: nowStr() }])
      if (isFirst) setPhase('INTERVENTION')
      if (result.type === 'suivi' && result.progression >= 100) setPhase('TERMINE')
    } catch (e) {
      setError(`ERR :: ${e.message}`)
      setMessages(prev => prev.filter(m => m.id !== userMsgId))
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setMessages([]); setApiHistory([]); setPhase('ATTENTE')
    setInputImage(null); setInputText(''); setError(null)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="app-shell">

      {/* ══ SCANLINES overlay ══ */}
      <div className="scanlines" aria-hidden="true" />

      {/* ══ HEADER ══ */}
      <header className="shell-header">
        <div className="hdr-left">
          <div className="hdr-logo">
            <span className="logo-sym">&gt;_</span>
          </div>
          <div>
            <div className="hdr-title glitch" data-text="SOLYSTIC SCANNER">SOLYSTIC SCANNER</div>
            <div className="hdr-sub">ARIA NEURAL CORE v3.7.2 // TGF-MTI-12 // PIC LA POSTE SAINT-PRIEST</div>
          </div>
        </div>

        <div className="hdr-right">
          <div className="hdr-clock">{time}</div>
          <div className={`phase-pill phase-${phase.toLowerCase()}`}>
            <span className="phase-dot" />
            {phase === 'ATTENTE'      && '[STANDBY]'}
            {phase === 'INTERVENTION' && '[ACTIVE]'}
            {phase === 'TERMINE'      && '[COMPLETE]'}
          </div>
          <a href="https://faloria-co.com" target="_blank" rel="noopener noreferrer" className="faloria-link">
            FALORIA &amp; Co
          </a>
          {messages.length > 0 && (
            <button className="btn-print" onClick={() => window.print()} title="Exporter">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              EXPORT
            </button>
          )}
          {phase !== 'ATTENTE' && (
            <button className="btn-reset" onClick={handleReset}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.1"/>
              </svg>
              NEW SESSION
            </button>
          )}
        </div>
      </header>

      {/* ══ CONVERSATION ══ */}
      <main className="shell-conv">

        {messages.length === 0 && (
          <div className="welcome-screen">
            <div className="boot-window">
              <div className="boot-titlebar">
                <span className="boot-titlebar-text">ARIA SECURE TERMINAL — INITIALISATION</span>
              </div>
              <div className="boot-body">
                <div className="boot-line"><span className="boot-ok">[  OK  ]</span> Chargement ARIA Neural Core v3.7.2</div>
                <div className="boot-line"><span className="boot-ok">[  OK  ]</span> Protocole Solystic TGF-MTI-12 — ACTIF</div>
                <div className="boot-line"><span className="boot-ok">[  OK  ]</span> PIC La Poste Saint-Priest — CONNECTE</div>
                <div className="boot-line"><span className="boot-ok">[  OK  ]</span> Module vision GPT-4o — OPERATIONNEL</div>
                <div className="boot-line"><span className="boot-ok">[  OK  ]</span> Chiffrement AES-256 — ETABLI</div>
                <div className="boot-line boot-blink">
                  <span className="boot-prompt">root@aria:~#</span> <span className="cursor-blink">█</span>
                </div>
              </div>
            </div>

            <p className="welcome-desc">
              Envoyez une photo de l'écran, d'un composant ou de l'intérieur de la machine.<br />
              ARIA analyse, diagnostique et vous guide en temps réel.
            </p>

            <div className="welcome-features">
              <div className="feat-item">
                <span className="feat-idx">[01]</span>
                <div>
                  <div className="feat-title">SCAN VISUEL TOTAL</div>
                  <div className="feat-desc">Écran HMI, câblage, capteurs, modules</div>
                </div>
              </div>
              <div className="feat-item">
                <span className="feat-idx">[02]</span>
                <div>
                  <div className="feat-title">DIAGNOSTIC IA INSTANTANE</div>
                  <div className="feat-desc">GPT-4o Vision — analyse en temps réel</div>
                </div>
              </div>
              <div className="feat-item">
                <span className="feat-idx">[03]</span>
                <div>
                  <div className="feat-title">GUIDAGE TACTIQUE</div>
                  <div className="feat-desc">Procédure étape par étape adaptée</div>
                </div>
              </div>
              <div className="feat-item">
                <span className="feat-idx">[04]</span>
                <div>
                  <div className="feat-title">SUIVI DE MISSION</div>
                  <div className="feat-desc">Photos de suivi — ARIA valide chaque action</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`msg-row msg-row--${msg.role}`}>

            {msg.role === 'user' && (
              <div className="user-bubble">
                {msg.imagePreview && (
                  <div className="user-img-wrap">
                    <img src={msg.imagePreview} alt="Capture envoyée" className="user-img" />
                    <div className="user-img-badge">// CAPTURE TRANSMISE</div>
                  </div>
                )}
                {msg.caption && <p className="user-caption">&gt; {msg.caption}</p>}
                <div className="msg-time">{msg.timestamp} // OPERATEUR</div>
              </div>
            )}

            {msg.role === 'ai' && (
              <div className="ai-bubble">
                <div className="ai-avatar">&gt;_</div>
                <div className="ai-content">
                  {msg.data?.type === 'diagnostic' && <DiagnosticCard data={msg.data} />}
                  {msg.data?.type === 'suivi'      && <SuiviCard      data={msg.data} />}
                  <div className="msg-time">{msg.timestamp} // ARIA</div>
                </div>
              </div>
            )}

          </div>
        ))}

        {loading && (
          <div className="msg-row msg-row--ai">
            <div className="ai-bubble">
              <div className="ai-avatar">&gt;_</div>
              <div className="loading-bubble">
                <div className="typing-dots">
                  <span /><span /><span />
                </div>
                <span className="loading-text">ARIA PROCESSING IMAGE<span className="ellipsis-anim">...</span></span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="error-row">
            <span className="alert-tag">!! SYS_ERR</span>
            {error}
          </div>
        )}

        <div ref={bottomRef} style={{ height: 1 }} />
      </main>

      {/* ══ INPUT BAR ══ */}
      <footer className="shell-input">
        {inputImage && (
          <div className="input-preview-bar">
            <div className="input-preview-thumb">
              <img src={inputImage.preview} alt="Aperçu" />
              <button className="input-preview-remove" onClick={() => setInputImage(null)}>✕</button>
            </div>
            <span className="input-preview-name">// {inputImage.file.name}</span>
          </div>
        )}

        <div
          className={`input-row${dragging ? ' input-row--drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <button className="btn-photo" onClick={() => fileRef.current?.click()} title="Charger image">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="1"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>

          <span className="input-prompt">root@aria:~#</span>

          <input
            ref={textRef}
            type="text"
            className="text-input"
            placeholder={phase === 'ATTENTE' ? 'décrire le problème...' : 'décrire l\'action ou poser une question...'}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <button
            className="btn-send"
            onClick={handleSend}
            disabled={loading || (!inputImage && !inputText.trim())}
          >
            {loading ? <span className="spinner-send" /> : <span className="send-label">EXEC</span>}
          </button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])} />

        <div className="input-hint">
          {dragging ? '// RELEASE TO UPLOAD' : '// DROP IMAGE · ENTER TO EXECUTE · IMAGE + TEXT SUPPORTED'}
        </div>
      </footer>

    </div>
  )
}
