# 🇮🇹 Italian Providers per SkyStream

Port ufficioso dei plugin di [doGior](https://github.com/doGior/doGiorsHadEnough) da CloudStream a **SkyStream** (formato JavaScript).

## Plugin inclusi

| Nome | Tipo | Stato |
|------|------|--------|
| StreamingCommunity | Film & Serie TV | ✅ |
| AnimeUnity | Anime ITA | ✅ |
| AnimeWorld | Anime ITA | ✅ |
| AltaDefinizione | Film & Serie TV | ✅ |
| CalcioStreaming | Live Sport | ✅ |

---

## Come installare in SkyStream

1. Apri **SkyStream** su Windows/Android
2. Vai in **Settings → Extensions → Add Repository**
3. Incolla l'URL del tuo `repo.json` (vedi sotto)

---

## ⚠️ Note importanti

### StreamingCommunity
Il dominio cambia frequentemente. Se non carica:
- In SkyStream vai su **Settings → Extensions → StreamingCommunity → Configure**
- Aggiorna il `baseUrl` con il dominio attuale (es. `https://streamingcommunity.computer`)

### CalcioStreaming  
Usa **AdGuard DNS** nelle impostazioni di SkyStream per bloccare le pubblicità invasive dei siti live.

### Differenze con CloudStream
Questi plugin sono scritti in **JavaScript** per SkyStream, quindi **non sono compatibili** con l'app CloudStream originale (che usa Kotlin .cs3).

---

## Crediti
- Plugin originali: [doGior](https://github.com/doGior/doGiorsHadEnough)
- Ported per SkyStream JS runtime
