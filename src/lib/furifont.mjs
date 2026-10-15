import manifest from '../data/furifont-manifest.json' with {type:'json'};

const keyFor = ({text,reading}) => `${text}\u0000${reading}`;
const entries = new Map(manifest.entries.map(entry => [keyFor(entry),entry]));
const loaders = new WeakMap();
const unavailable = Object.freeze({
  subscribe: () => () => {},
  getSnapshot: () => false,
  load: () => Promise.resolve(false),
});

/** Select only the reviewed reading for this exact word-boundary fragment. */
export function furifontEntry(part) {
  return part.reading ? entries.get(keyFor(part)) : undefined;
}

export const furifontFamily = manifest.family;
export const furifontFeatures = salt => `"rclt" 1, "salt" ${salt}`;

export function furifontStyle(entry) {
  const overhang = entry.inkOverhangEm;
  return {
    fontFamily:`"${furifontFamily}", var(--jp)`,
    fontFeatureSettings:furifontFeatures(entry.salt),
    paddingInlineStart:overhang?.left ? `${overhang.left}em` : undefined,
    paddingInlineEnd:overhang?.right ? `${overhang.right}em` : undefined,
  };
}

/** Loading is shared by every Japanese fragment using the same FontFaceSet. */
export function createFurifontLoader({fontSet,FontFace,baseUrl}) {
  let ready = false;
  let pending;
  const subscribers = new Set();
  const load = () => {
    if(pending)return pending;
    pending = (async () => {
      try {
        if(!fontSet?.add || !FontFace)return false;
        const source = new URL(manifest.fontUrl,baseUrl);
        source.searchParams.set('v',manifest.metadata.font.sha256);
        const face = new FontFace(manifest.family,`url("${source.href}") format("woff2")`,{
          style:'normal',weight:'250 900',display:'swap',
        });
        const loaded = await face.load();
        // A fallback system font or an empty FontFaceSet.load result is not proof
        // that the annotation font exists. Only this exact loaded face qualifies.
        if(loaded !== face || (face.status && face.status !== 'loaded'))return false;
        fontSet.add(face);
        ready = true;
        for(const subscriber of subscribers)subscriber();
        return true;
      } catch {
        // Native ruby remains visible if the font API, request or font fails.
        return false;
      }
    })();
    return pending;
  };
  return {
    getSnapshot: () => ready,
    subscribe: subscriber => {
      subscribers.add(subscriber);
      void load();
      return () => subscribers.delete(subscriber);
    },
    load,
  };
}

export function getFurifontLoader() {
  const page = globalThis.document;
  const FontFace = globalThis.FontFace ?? page?.defaultView?.FontFace;
  if(!page?.fonts || !FontFace)return unavailable;
  if(!loaders.has(page.fonts)) {
    const baseUrl = new URL(import.meta.env?.BASE_URL ?? './',page.baseURI).href;
    loaders.set(page.fonts,createFurifontLoader({fontSet:page.fonts,FontFace,baseUrl}));
  }
  return loaders.get(page.fonts);
}
