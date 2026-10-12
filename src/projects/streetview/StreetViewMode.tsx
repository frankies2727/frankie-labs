/// <reference types="vite/client" />

import React, { useState, useRef, useEffect } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import {
  Play,
  Pause,
  Search,
  Clock,
  MapPin,
  Video,
  Download,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ClearButton } from '../../components/ClearButton';

interface HistoricalImage {
  pano: string;
  dateStr: string;
  year: number;
  month: number;
  timestamp: number;
}

declare global {
  interface Window {
    gm_authFailure: () => void;
  }
}

const KEY_STORAGE = 'sv_gmaps_key';

// The gallery is a static GitHub Pages site with no server, so each visitor
// brings their own Google Maps JS API key. We persist it in localStorage and
// fall back to a build-time key if one was ever configured.
const readStoredKey = (): string => {
  try {
    return (
      localStorage.getItem(KEY_STORAGE) ||
      import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
      ''
    );
  } catch {
    return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  }
};

// Street View Static image URL, hit directly (no server proxy). Plain <img>
// display is not subject to CORS, so this works on the static site.
const streetViewUrl = (pano: string, heading: number, key: string) =>
  `https://maps.googleapis.com/maps/api/streetview?size=800x600&pano=${pano}&heading=${Math.round(
    heading,
  )}&pitch=0&key=${key}`;

export function StreetViewMode() {
  const [apiKey, setApiKey] = useState<string>(() => readStoredKey());
  const [keyInput, setKeyInput] = useState('');

  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [images, setImages] = useState<HistoricalImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1000);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');
  const [targetHeading, setTargetHeading] = useState(0);

  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);
  const geometryLibRef = useRef<google.maps.GeometryLibrary | null>(null);
  const targetLocationRef = useRef<google.maps.LatLng | null>(null);

  const saveKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(KEY_STORAGE, trimmed);
    } catch {
      /* ignore storage failures — key still lives in state for this session */
    }
    setError(null);
    setApiKey(trimmed);
  };

  const changeKey = () => {
    try {
      localStorage.removeItem(KEY_STORAGE);
    } catch {
      /* ignore */
    }
    setImages([]);
    setIsPlaying(false);
    setError(null);
    setKeyInput('');
    setApiKey('');
  };

  // Best-effort, fully client-side video export. Google's Street View Static
  // API does not send CORS headers, so an anonymous cross-origin image either
  // fails to load or taints the canvas (which blocks captureStream/toBlob). We
  // attempt the export and, if the browser refuses, surface a clear message
  // rather than silently failing.
  const exportVideo = async () => {
    if (images.length === 0 || !apiKey) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportMessage('Preparing images…');

    const heading = Math.round(targetHeading);

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Canvas not supported in this browser.');
      setIsExporting(false);
      return;
    }

    try {
      // 1. Download every frame with CORS so the canvas stays untainted.
      const loadedImages: { img: HTMLImageElement; dateStr: string }[] = [];
      let loadedCount = 0;

      for (const hist of images) {
        const url = streetViewUrl(hist.pano, heading, apiKey);
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            loadedImages.push({ img, dateStr: hist.dateStr });
            loadedCount++;
            setExportProgress((loadedCount / images.length) * 50);
            resolve();
          };
          img.onerror = () =>
            reject(new Error(`Failed to load image for ${hist.dateStr}`));
          img.src = url;
        });
      }

      setExportMessage('Rendering video…');

      // 2. Record the canvas as it steps through the frames.
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recordingPromise = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `streetview-timelapse-${address
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase()}.webm`;
          a.click();
          URL.revokeObjectURL(url);
          resolve();
        };
      });

      recorder.start();

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < loadedImages.length; i++) {
        const { img, dateStr } = loadedImages[i];
        ctx.drawImage(img, 0, 0, 800, 600);

        // Date caption (this touches canvas pixels — fine while untainted).
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(20, canvas.height - 70, 200, 50);
        ctx.font = '24px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(dateStr, 40, canvas.height - 35);

        setExportProgress(50 + ((i + 1) / loadedImages.length) * 50);
        await sleep(playSpeed);
      }

      recorder.stop();
      await recordingPromise;
    } catch (err) {
      console.error(err);
      setError(
        'Video export is blocked here: Google returns the Street View stills without cross-origin (CORS) headers, so the browser will not let them be recorded. Playback and the timeline still work.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Load the Google Maps libraries once a key is available.
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;

    const initMaps = async () => {
      window.gm_authFailure = () => {
        setError(
          'Google Maps rejected this API key. Ensure "Maps JavaScript API" and "Geocoding API" are enabled for it in the Google Cloud Console, and that any referrer restriction allows this site.',
        );
      };

      try {
        setOptions({ key: apiKey, v: 'weekly' });
        const [geocodingLib, streetViewLib, geometryLib] = await Promise.all([
          importLibrary('geocoding'),
          importLibrary('streetView'),
          importLibrary('geometry'),
        ]);
        if (cancelled) return;
        geocoderRef.current = new geocodingLib.Geocoder();
        svServiceRef.current = new streetViewLib.StreetViewService();
        geometryLibRef.current = geometryLib;
      } catch (err) {
        console.error('Failed to load Google Maps:', err);
        if (!cancelled)
          setError('Failed to load Google Maps. Please check your API key.');
      }
    };

    initMaps();
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // Playback timer.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && images.length > 0) {
      interval = setInterval(() => {
        setCurrentIndex((prev) => prev + 1);
      }, playSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, images.length, playSpeed]);

  // Stop at the end of the timeline.
  useEffect(() => {
    if (isPlaying && images.length > 0 && currentIndex >= images.length - 1) {
      setIsPlaying(false);
    }
  }, [currentIndex, isPlaying, images.length]);

  const extractImages = (
    data: google.maps.StreetViewPanoramaData,
  ): HistoricalImage[] => {
    const rawTime = (data as any).time;
    const extracted: HistoricalImage[] = [];

    const parseDate = (d: any, defaultStr: string) => {
      let year = 1970;
      let month = 1;
      let dateStr = defaultStr;

      if (d instanceof Date) {
        year = d.getFullYear();
        month = d.getMonth() + 1;
        dateStr = `${year}-${month.toString().padStart(2, '0')}`;
      } else if (typeof d === 'string') {
        if (d.includes('T')) {
          const dateObj = new Date(d);
          if (!isNaN(dateObj.getTime())) {
            year = dateObj.getFullYear();
            month = dateObj.getMonth() + 1;
            dateStr = `${year}-${month.toString().padStart(2, '0')}`;
          }
        } else {
          dateStr = d;
          const parts = d.split('-');
          if (parts.length >= 2) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
          } else if (parts.length === 1 && parts[0].length === 4) {
            year = parseInt(parts[0], 10);
            dateStr = `${year}`;
          }
        }
      } else if (d && d.getFullYear) {
        year = d.getFullYear();
        month = typeof d.getMonth === 'function' ? d.getMonth() + 1 : 1;
        dateStr = `${year}-${month.toString().padStart(2, '0')}`;
      }

      return { year, month, dateStr };
    };

    // Always include the current image.
    const currentPano = data.location?.pano;
    const currentImageDate =
      data.imageDate ||
      `${new Date().getFullYear()}-${(new Date().getMonth() + 1)
        .toString()
        .padStart(2, '0')}`;

    if (currentPano) {
      const parsed = parseDate(currentImageDate, currentImageDate);
      extracted.push({
        pano: currentPano,
        dateStr: parsed.dateStr,
        year: parsed.year,
        month: parsed.month,
        timestamp: parsed.year * 100 + parsed.month,
      });
    }

    // Historical imagery lives on a `time` array whose date key Google
    // sometimes obfuscates — find it dynamically.
    if (Array.isArray(rawTime)) {
      rawTime.forEach((item: any) => {
        if (item && item.pano) {
          let t = item.time || item.imageDate || item.description;
          if (!t) {
            for (const key of Object.keys(item)) {
              if (key !== 'pano') {
                t = item[key];
                break;
              }
            }
          }
          if (!t) t = currentImageDate;

          const parsed = parseDate(t, t);
          extracted.push({
            pano: item.pano,
            dateStr: parsed.dateStr,
            year: parsed.year,
            month: parsed.month,
            timestamp: parsed.year * 100 + parsed.month,
          });
        }
      });
    }

    // Dedupe by pano, then sort chronologically.
    const unique = Array.from(
      new Map(extracted.map((item) => [item.pano, item])).values(),
    );
    unique.sort((a, b) => a.timestamp - b.timestamp);
    return unique;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim() || !geocoderRef.current || !svServiceRef.current) return;

    setLoading(true);
    setError(null);
    setIsPlaying(false);
    setImages([]);
    setCurrentIndex(0);

    const processPanoData = async (
      initialPanoData: google.maps.StreetViewPanoramaData,
    ) => {
      const allPanosToCheck = [initialPanoData];

      // Enrich history with up to 4 neighbouring panos.
      if (initialPanoData.links && initialPanoData.links.length > 0) {
        const linkPromises = initialPanoData.links.slice(0, 4).map((link) => {
          if (link.pano) {
            return svServiceRef.current!.getPanorama({ pano: link.pano });
          }
          return Promise.reject();
        });
        const linkResults = await Promise.all(
          linkPromises.map((p) => p.catch(() => null)),
        );
        linkResults.forEach((res) => {
          if (res && res.data) allPanosToCheck.push(res.data);
        });
      }

      const allHistoricalImages: HistoricalImage[] = [];
      allPanosToCheck.forEach((panoData) => {
        allHistoricalImages.push(...extractImages(panoData));
      });

      // Keep one image per month so playback doesn't jitter within a capture.
      const uniqueByMonth = new Map<number, HistoricalImage>();
      allHistoricalImages.forEach((img) => {
        if (!uniqueByMonth.has(img.timestamp)) {
          uniqueByMonth.set(img.timestamp, img);
        }
      });

      const finalImages = Array.from(uniqueByMonth.values());
      finalImages.sort((a, b) => a.timestamp - b.timestamp);

      if (finalImages.length === 0) {
        setError('No Street View imagery found for this location.');
        setLoading(false);
        return;
      }

      // Aim the camera from the pano toward the searched location.
      if (
        geometryLibRef.current &&
        initialPanoData.location?.latLng &&
        targetLocationRef.current
      ) {
        const heading = geometryLibRef.current.spherical.computeHeading(
          initialPanoData.location.latLng,
          targetLocationRef.current,
        );
        setTargetHeading(heading);
      } else {
        setTargetHeading(0);
      }

      setImages(finalImages);
      setCurrentIndex(0);
      setLoading(false);
    };

    geocoderRef.current.geocode({ address }, async (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const location = results[0].geometry.location;
        targetLocationRef.current = location;

        try {
          let bestData: google.maps.StreetViewPanoramaData | null = null;

          const routeComponent = results[0].address_components.find((c: any) =>
            c.types.includes('route'),
          );
          const routeNames = routeComponent
            ? [
                routeComponent.short_name.toLowerCase(),
                routeComponent.long_name.toLowerCase(),
              ]
            : [];

          const checkPano = async (
            loc: google.maps.LatLng,
            radius: number,
            source?: google.maps.StreetViewSource,
          ) => {
            return new Promise<google.maps.StreetViewPanoramaData | null>(
              (resolve) => {
                svServiceRef
                  .current!.getPanorama({ location: loc, radius, source })
                  .then((res) => resolve(res.data || null))
                  .catch(() => resolve(null));
              },
            );
          };

          const checkDataForHistory = (
            data: google.maps.StreetViewPanoramaData,
          ) => {
            const timeArr = (data as any).time;
            return timeArr && timeArr.length > 1;
          };

          const hasRouteMatch = (
            data: google.maps.StreetViewPanoramaData,
          ) => {
            const desc = data.location?.description?.toLowerCase() || '';
            if (!desc || routeNames.length === 0) return false;
            return routeNames.some((name) => desc.includes(name));
          };

          const candidatePanos: google.maps.StreetViewPanoramaData[] = [];

          if (geometryLibRef.current) {
            const spherical = geometryLibRef.current.spherical;
            const searchLocs = [
              location,
              spherical.computeOffset(location, 20, 0),
              spherical.computeOffset(location, 20, 90),
              spherical.computeOffset(location, 20, 180),
              spherical.computeOffset(location, 20, 270),
              spherical.computeOffset(location, 40, 0),
              spherical.computeOffset(location, 40, 90),
              spherical.computeOffset(location, 40, 180),
              spherical.computeOffset(location, 40, 270),
            ];

            const promises = searchLocs.map((loc) =>
              checkPano(loc, 25, google.maps.StreetViewSource.OUTDOOR),
            );
            const panoResults = await Promise.all(promises);
            panoResults.forEach((res) => {
              if (
                res &&
                !candidatePanos.find(
                  (p) => p.location?.pano === res.location?.pano,
                )
              ) {
                candidatePanos.push(res);
              }
            });
          }

          if (candidatePanos.length === 0) {
            const fallback = await checkPano(location, 100);
            if (fallback) candidatePanos.push(fallback);
          }

          if (candidatePanos.length > 0) {
            // Prefer panos with history and matching the searched street.
            let bestPano = candidatePanos[0];
            let bestScore = -999;

            candidatePanos.forEach((pano) => {
              let score = 0;
              if (checkDataForHistory(pano)) score += 10;
              if (hasRouteMatch(pano)) score += 15;

              let dist = 100;
              if (geometryLibRef.current && pano.location?.latLng) {
                dist = geometryLibRef.current.spherical.computeDistanceBetween(
                  pano.location.latLng,
                  location,
                );
              }
              score -= dist / 100;

              if (score > bestScore) {
                bestScore = score;
                bestPano = pano;
              }
            });

            targetLocationRef.current = location;
            return processPanoData(bestPano);
          }

          // Spiral outward to find any nearby road with history.
          setExportMessage('Searching nearby roads for history…');
          const offsets = [
            { heading: 0, distance: 500 },
            { heading: 90, distance: 500 },
            { heading: 180, distance: 500 },
            { heading: 270, distance: 500 },
            { heading: 0, distance: 1000 },
            { heading: 90, distance: 1000 },
            { heading: 180, distance: 1000 },
            { heading: 270, distance: 1000 },
            { heading: 0, distance: 2000 },
            { heading: 90, distance: 2000 },
            { heading: 180, distance: 2000 },
            { heading: 270, distance: 2000 },
          ];

          if (geometryLibRef.current) {
            for (const offset of offsets) {
              const testLoc = geometryLibRef.current.spherical.computeOffset(
                location,
                offset.distance,
                offset.heading,
              );
              const testData = await checkPano(
                testLoc,
                100,
                google.maps.StreetViewSource.OUTDOOR,
              );
              if (testData && checkDataForHistory(testData)) {
                bestData = testData;
                targetLocationRef.current = testLoc;
                break;
              }
            }
          }
          setExportMessage('');

          if (bestData) return processPanoData(bestData);

          setError('Street View data is unavailable here.');
          setLoading(false);
        } catch (err) {
          setError('No Street View found nearby.');
          setLoading(false);
        }
      } else {
        if (status === 'REQUEST_DENIED') {
          setError(
            'API key error: this key is not authorized. In the Google Cloud Console, enable the "Geocoding API" and make sure the key is not restricted from this site.',
          );
        } else {
          setError(`Could not locate address: ${status}`);
        }
        setLoading(false);
      }
    });
  };

  // ---- Key-entry gate -------------------------------------------------------
  if (!apiKey) {
    return (
      <div className="h-full bg-neutral-950 text-neutral-100 font-sans flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 py-10 overflow-y-auto">
          <div className="max-w-md w-full space-y-6">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
                <Clock className="w-7 h-7 text-emerald-400" />
              </div>
              <h1 className="text-2xl font-semibold text-white">
                Street View Timelapse
              </h1>
              <p className="text-sm text-neutral-100 leading-relaxed">
                Watch any place change through the years. This runs entirely in
                your browser, so it needs a Google Maps API key of your own —
                stored only on this device.
              </p>
            </div>

            <form onSubmit={saveKey} className="space-y-3">
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-100" />
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Paste your Google Maps API key"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder-neutral-500"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={!keyInput.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-medium py-3 rounded-xl text-sm transition-colors disabled:cursor-not-allowed"
              >
                Save key & continue
              </button>
            </form>

            <div className="text-xs text-neutral-100 leading-relaxed space-y-2">
              <p>
                Enable the <span className="text-neutral-100">Maps JavaScript API</span>{' '}
                and <span className="text-neutral-100">Geocoding API</span> for the
                key. It stays in your browser and is never sent anywhere but Google.
              </p>
              <a
                href="https://console.cloud.google.com/google/maps-apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
              >
                Get an API key
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Main app -------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100 font-sans">
      {/* Header */}
      <header className="flex-none p-4 md:px-6 md:py-4 border-b border-neutral-800 bg-neutral-900/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-medium tracking-tight text-white">
              Street View
            </h1>
          </div>

          <form onSubmit={handleSearch} className="flex-1 max-w-2xl flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-100" />
              <input
                type="text"
                placeholder="Enter an address (e.g. 1 Infinite Loop, Cupertino)"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-full py-2.5 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder-neutral-500"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              {address && <ClearButton onClear={() => setAddress('')} className="right-0 text-neutral-100 hover:text-white" />}
            </div>
            <button
              type="submit"
              disabled={loading || !address.trim()}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-medium py-2 px-6 rounded-full text-sm transition-colors disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[100px]"
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-neutral-950/20 border-t-neutral-950 animate-spin" />
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                </>
              )}
            </button>
          </form>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col min-h-0 bg-neutral-950">
        {/* Error overlay */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-lg bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg shadow-xl text-sm backdrop-blur-md"
            >
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Street View image */}
        <div className="flex-1 relative bg-neutral-900 border-x border-neutral-800 overflow-hidden">
          {isExporting && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-30 bg-neutral-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8"
            >
              <div className="max-w-md w-full space-y-4">
                <div className="text-center space-y-2">
                  <Video className="w-12 h-12 text-emerald-400 mx-auto animate-pulse" />
                  <h3 className="text-xl font-medium text-white">
                    Exporting Video
                  </h3>
                  <p className="text-sm text-neutral-100">{exportMessage}</p>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-emerald-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${exportProgress}%` }}
                    transition={{ ease: 'linear', duration: 0.2 }}
                  />
                </div>
                <p className="text-xs text-center text-neutral-100">
                  {Math.round(exportProgress)}%
                </p>
              </div>
            </motion.div>
          )}

          {images.length > 0 ? (
            <img
              src={streetViewUrl(
                images[currentIndex].pano,
                targetHeading,
                apiKey,
              )}
              alt={`Street View ${images[currentIndex].dateStr}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-100 flex-col gap-4">
              <MapPin className="w-12 h-12 opacity-20" />
              <p className="text-sm">Search for a location to view its history</p>
            </div>
          )}
        </div>

        {/* Timeline bottom bar */}
        <div className="flex-none h-40 md:h-48 border-t border-neutral-800 bg-neutral-900 p-4 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (currentIndex >= images.length - 1) {
                    setCurrentIndex(0);
                    setIsPlaying(true);
                  } else {
                    setIsPlaying((p) => !p);
                  }
                }}
                disabled={images.length <= 1}
                className="w-12 h-12 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center hover:bg-emerald-400 transition-colors disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-100"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" fill="currentColor" />
                ) : (
                  <Play className="w-5 h-5 ml-1" fill="currentColor" />
                )}
              </button>

              <div className="hidden md:flex items-center gap-2 bg-neutral-800 rounded-full px-3 py-1.5 ml-2">
                {(
                  [
                    ['Slow', 2000],
                    ['Normal', 1000],
                    ['Fast', 500],
                  ] as const
                ).map(([label, speed]) => (
                  <button
                    key={label}
                    onClick={() => setPlaySpeed(speed)}
                    className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                      playSpeed === speed
                        ? 'bg-neutral-700 text-emerald-400'
                        : 'text-neutral-100 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                onClick={exportVideo}
                disabled={isExporting || images.length <= 1}
                className="ml-2 flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:bg-neutral-900"
              >
                {isExporting ? (
                  <div className="w-4 h-4 rounded-full border-2 border-neutral-500 border-t-emerald-400 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 text-emerald-400" />
                )}
                {isExporting ? 'Exporting…' : 'Export Video'}
              </button>
            </div>

            <div className="text-right">
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={changeKey}
                  title="Use a different API key"
                  className="hidden md:inline text-[10px] font-mono uppercase tracking-widest text-neutral-100 hover:text-neutral-100 transition-colors"
                >
                  Change key
                </button>
                <p className="text-sm text-neutral-100 font-medium">
                  Currently Viewing
                </p>
              </div>
              <div className="text-2xl md:text-3xl font-light text-white tabular-nums tracking-tight">
                {images[currentIndex] ? images[currentIndex].dateStr : '----'}
              </div>
            </div>
          </div>

          {/* Timeline scroller */}
          <div className="relative flex-1 bg-neutral-950/50 rounded-xl border border-neutral-800/80 p-2 overflow-x-auto flex items-center gap-2 custom-scrollbar-h">
            {images.length > 0 ? (
              <div className="flex items-end h-full px-4 gap-1 w-full relative pt-6">
                {images.map((img, idx) => {
                  const isActive = idx === currentIndex;
                  return (
                    <button
                      key={img.pano + idx}
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentIndex(idx);
                      }}
                      className="group relative flex-1 flex flex-col items-center justify-end min-w-[40px] transition-all"
                    >
                      <span
                        className={`absolute -top-7 text-xs font-mono transition-all ${
                          isActive
                            ? 'text-emerald-400 opacity-100 scale-110'
                            : 'text-neutral-100 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {img.year}
                      </span>
                      <div
                        className={`w-full rounded-t-sm transition-all duration-300 ${
                          isActive
                            ? 'h-full min-h-[32px] bg-emerald-500'
                            : 'h-2 bg-neutral-700 group-hover:bg-neutral-600 group-hover:h-4'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-neutral-100 uppercase tracking-widest">
                Timeline Empty
              </div>
            )}
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar-h::-webkit-scrollbar { height: 6px; }
        .custom-scrollbar-h::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.2);
          border-radius: 4px;
        }
        .custom-scrollbar-h::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }
        .custom-scrollbar-h::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </div>
  );
}
