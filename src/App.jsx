import { useState, useRef } from 'react'

async function analyzeImage(base64Data, mimeType) {
  const apiKey = import.meta.env.VITE_OPENAI_KEY
  if (!apiKey) throw new Error('Clé API OpenAI manquante dans .env (VITE_OPENAI_KEY)')

  const prompt = `Tu es un technicien expert niveau 3 en maintenance des machines de tri postal Solystic TGF-MTI-12, utilisées au PIC La Poste Saint-Priest.

Analyse précisément l'écran affiché sur cette photo et génère une fiche d'intervention complète.

IMPORTANT : Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après.

Format JSON attendu :
{
  "code_erreur": "code visible sur l'écran ou null",
  "sous_systeme": "nom du sous-système concerné (ex: Dépilement, Transport, Lecture OCR, Éjection, Alimentation...)",
  "indicateurs": {
    "vitesse": "valeur affichée ou null",
    "efficacite": "valeur affichée ou null",
    "plis_depiles": "valeur affichée ou null",
    "recirculation_haut": "valeur affichée ou null",
    "recirculation_bas": "valeur affichée ou null",
    "tri_cumule": "valeur affichée ou null"
  },
  "score_criticite": 0,
  "statut": "NORMAL",
  "diagnostic": "Description précise et technique de ce que montre l'écran. Citer les valeurs, codes, voyants visibles.",
  "cause_probable": "Explication technique détaillée de la cause probable du problème observé.",
  "impact_estime": "Impact concret sur le traitement du courrier (ex: réduction de X% du débit, arrêt total...).",
  "securite": [
    "Consigne de sécurité obligatoire à respecter avant toute intervention"
  ],
  "outils_necessaires": [
    "Liste des outils ou équipements nécessaires à l'intervention"
  ],
  "temps_estime": "Durée estimée de l'intervention (ex: 15-20 minutes)",
  "etapes_intervention": [
    {
      "numero": 1,
      "titre": "Titre court de l'étape",
      "description": "Description très détaillée, phrase par phrase, de ce qu'il faut faire exactement. Indiquer où aller, quoi toucher, dans quel ordre, comment le reconnaître.",
      "attention": "Point d'attention critique ou risque particulier à cette étape, ou null si aucun"
    }
  ],
  "verification_finale": [
    "Vérification à effectuer pour confirmer que la machine est revenue à la normale"
  ],
  "action_preventive": "Action préventive recommandée pour éviter que ce problème se reproduise. Être très précis sur la fréquence et la méthode.",
  "escalade": "Décrire précisément dans quelle situation il faut appeler un technicien spécialisé et quel service contacter."
}

Règles :
- score_criticite : entier de 0 (tout va bien) à 10 (arrêt machine immédiat requis)
- statut : exactement "NORMAL", "ATTENTION", "CRITIQUE" ou "URGENCE"
- etapes_intervention : au minimum 4 étapes, maximum 12. Chaque étape doit être assez détaillée pour qu'un agent sans expérience puisse l'exécuter seul.
- Si une valeur indicateur n'est pas visible sur l'écran, mettre null.
- Rédiger en français, de manière claire et directe.`

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Data}` },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Erreur API ${resp.status}`)
  }

  const data = await resp.json()
  const text = data.choices?.[0]?.message?.content || '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Réponse GPT-4o non parsable')
  return JSON.parse(jsonMatch[0])
}

const STATUT_CONFIG = {
  NORMAL:    { color: '#4ade80', bg: '#021a0a', label: 'NORMAL',    border: '#166534' },
  ATTENTION: { color: '#fbbf24', bg: '#1a1000', label: 'ATTENTION', border: '#92400e' },
  CRITIQUE:  { color: '#f87171', bg: '#1a0404', label: 'CRITIQUE',  border: '#991b1b' },
  URGENCE:   { color: '#c084fc', bg: '#120820', label: 'URGENCE',   border: '#6b21a8' },
}

function StatusBar({ statut, score }) {
  const cfg = STATUT_CONFIG[statut] || STATUT_CONFIG.NORMAL
  return (
    <div className="status-bar" style={{ background: cfg.bg, borderColor: cfg.border }}>
      <div className="status-indicator" style={{ background: cfg.color }} />
      <span className="status-label" style={{ color: cfg.color }}>{cfg.label}</span>
      <div className="status-divider" />
      <span className="status-score-label">CRITICITE</span>
      <span className="status-score" style={{ color: cfg.color }}>{score} / 10</span>
    </div>
  )
}

function Section({ title, tag, children }) {
  return (
    <div className="section">
      <div className="section-header">
        {tag && <span className="section-tag">{tag}</span>}
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="section-body">{children}</div>
    </div>
  )
}

function EtapeCard({ etape }) {
  return (
    <div className="etape-card">
      <div className="etape-num">
        <span>{String(etape.numero).padStart(2, '0')}</span>
      </div>
      <div className="etape-body">
        <div className="etape-titre">{etape.titre.toUpperCase()}</div>
        <p className="etape-desc">{etape.description}</p>
        {etape.attention && (
          <div className="etape-attention">
            <span className="attention-tag">ATTENTION</span>
            {etape.attention}
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [image, setImage] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    setResult(null)
    setError(null)
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  async function handleAnalyze() {
    if (!image) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(image)
      })
      setResult(await analyzeImage(base64, image.type))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const ind = result?.indicateurs || {}
  const cfg = STATUT_CONFIG[result?.statut] || STATUT_CONFIG.NORMAL

  return (
    <div className="app">

      {/* ── TOPBAR ── */}
      <div className="topbar">
        <div className="topbar-left">
          <div className="topbar-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
          </div>
          <div>
            <div className="topbar-title">SOLYSTIC SCANNER</div>
            <div className="topbar-sub">SYSTEME DE DIAGNOSTIC — TGF-MTI-12 · PIC LA POSTE SAINT-PRIEST</div>
          </div>
        </div>
        <div className="topbar-right">
          <a
            href="https://faloria-co.com"
            target="_blank"
            rel="noopener noreferrer"
            className="faloria-link"
          >
            FALORIA &amp; Co
          </a>
          {result && (
            <button className="btn-print" onClick={() => window.print()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
              </svg>
              IMPRIMER LA FICHE
            </button>
          )}
        </div>
      </div>

      <main>

        {/* ── UPLOAD ── */}
        <div className="upload-panel">
          <div className="upload-panel-label">CHARGEMENT DE L'IMAGE</div>
          <div
            className={`dropzone${dragging ? ' dragging' : ''}${preview ? ' has-image' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {preview ? (
              <img src={preview} alt="Ecran machine" className="preview" />
            ) : (
              <div className="drop-hint">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="drop-svg">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <p>DEPOSER UNE PHOTO D'ECRAN ICI</p>
                <p className="drop-sub">FORMAT JPG / PNG — OU CLIQUER POUR PARCOURIR</p>
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])} />
          </div>

          {preview && (
            <button className="btn-analyze" onClick={handleAnalyze} disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  ANALYSE EN COURS — VEUILLEZ PATIENTER
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  GENERER LA FICHE D'INTERVENTION
                </>
              )}
            </button>
          )}
        </div>

        {error && (
          <div className="alert-error">
            <span className="alert-tag">ERREUR SYSTEME</span>
            {error}
          </div>
        )}

        {/* ── RESULTATS ── */}
        {result && (
          <div className="results" id="printable">

            {/* En-tête fiche */}
            <div className="fiche-header" style={{ borderColor: cfg.border }}>
              <div className="fiche-header-top">
                <StatusBar statut={result.statut} score={result.score_criticite} />
                <div className="fiche-meta">
                  {result.code_erreur && (
                    <div className="meta-item">
                      <span className="meta-label">CODE ERREUR</span>
                      <span className="meta-value code-erreur">{result.code_erreur}</span>
                    </div>
                  )}
                  {result.sous_systeme && (
                    <div className="meta-item">
                      <span className="meta-label">SOUS-SYSTEME</span>
                      <span className="meta-value">{result.sous_systeme}</span>
                    </div>
                  )}
                  {result.temps_estime && (
                    <div className="meta-item">
                      <span className="meta-label">TEMPS ESTIME</span>
                      <span className="meta-value">{result.temps_estime}</span>
                    </div>
                  )}
                  <div className="meta-item">
                    <span className="meta-label">HORODATAGE</span>
                    <span className="meta-value mono">{new Date().toLocaleString('fr-FR')}</span>
                  </div>
                </div>
              </div>
              <div className="fiche-diagnostic-label">DIAGNOSTIC</div>
              <p className="fiche-diagnostic">{result.diagnostic}</p>
            </div>

            {/* Indicateurs */}
            {Object.values(ind).some(v => v !== null) && (
              <Section title="INDICATEURS MACHINE" tag="01">
                <div className="indicators-grid">
                  {Object.entries(ind).map(([key, val]) => (
                    <div key={key} className={`indicator${val === null ? ' na' : ''}`}>
                      <span className="ind-label">{key.replace(/_/g, ' ').toUpperCase()}</span>
                      <span className="ind-value">{val ?? 'N/A'}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Sécurité */}
            {result.securite?.length > 0 && (
              <Section title="CONSIGNES DE SECURITE — OBLIGATOIRE AVANT INTERVENTION" tag="02">
                <ul className="list-securite">
                  {result.securite.map((s, i) => (
                    <li key={i}>
                      <span className="sec-index">{String(i + 1).padStart(2, '0')}</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Analyse */}
            <Section title="ANALYSE TECHNIQUE" tag="03">
              <div className="analyse-grid">
                <div className="analyse-item">
                  <div className="analyse-label">CAUSE PROBABLE</div>
                  <p>{result.cause_probable}</p>
                </div>
                <div className="analyse-item">
                  <div className="analyse-label">IMPACT SUR LE TRAITEMENT</div>
                  <p>{result.impact_estime}</p>
                </div>
              </div>
            </Section>

            {/* Outils */}
            {result.outils_necessaires?.length > 0 && (
              <Section title="EQUIPEMENTS REQUIS" tag="04">
                <div className="outils-grid">
                  {result.outils_necessaires.map((o, i) => (
                    <div key={i} className="outil-item">
                      <span className="outil-index">{String(i + 1).padStart(2, '0')}</span>
                      {o}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Etapes */}
            {result.etapes_intervention?.length > 0 && (
              <Section title="PROCEDURE D'INTERVENTION" tag="05">
                <div className="etapes-list">
                  {result.etapes_intervention.map((e) => (
                    <EtapeCard key={e.numero} etape={e} />
                  ))}
                </div>
              </Section>
            )}

            {/* Vérification finale */}
            {result.verification_finale?.length > 0 && (
              <Section title="VERIFICATION FINALE" tag="06">
                <ul className="list-verif">
                  {result.verification_finale.map((v, i) => (
                    <li key={i}>
                      <input type="checkbox" id={`v${i}`} />
                      <label htmlFor={`v${i}`}>{v}</label>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Bas de fiche */}
            <div className="bottom-grid">
              {result.action_preventive && (
                <div className="bottom-card preventif">
                  <div className="bottom-card-tag">ACTION PREVENTIVE</div>
                  <p>{result.action_preventive}</p>
                </div>
              )}
              {result.escalade && (
                <div className="bottom-card escalade">
                  <div className="bottom-card-tag">ESCALADE TECHNIQUE</div>
                  <p>{result.escalade}</p>
                </div>
              )}
            </div>

            <div className="fiche-footer">
              Fiche generee par <a href="https://faloria-co.com" target="_blank" rel="noopener noreferrer">FALORIA &amp; Co</a> — Systeme de diagnostic IA Solystic TGF-MTI-12
            </div>

          </div>
        )}
      </main>
    </div>
  )
}
