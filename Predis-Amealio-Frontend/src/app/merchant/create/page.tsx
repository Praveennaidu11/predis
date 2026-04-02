'use client'; 
 
 import { useEffect, useMemo, useRef, useState } from 'react'; 
 import DashboardLayout from '@/components/layout/DashboardLayout'; 
 import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'; 
 import { Button } from '@/components/ui/button'; 
 import { Textarea } from '@/components/ui/textarea'; 
 import { Input } from '@/components/ui/input'; 
 import { 
   Copy, 
   RefreshCw, 
   Save, 
   Video, 
   Loader2, 
   Plus, 
   Image as ImageIcon, 
   FileVideo, 
   FileText, 
   X, 
   Mic, 
   ArrowUp, 
   Paperclip, 
   Sparkles, 
   Brain, 
   Search, 
   MoreHorizontal,
   History
 } from 'lucide-react'; 
 import { toast } from 'sonner'; 
 import { contentApi, ContentItem } from '@/lib/api/content'; 
 import { videoApi } from '@/lib/api/video'; 
 import { generationApi, PromptHistory } from '@/lib/api/generation';
 import { useSearchParams } from 'next/navigation'; 
 import { 
   DropdownMenu, 
   DropdownMenuContent, 
   DropdownMenuItem, 
   DropdownMenuTrigger, 
 } from '@/components/ui/dropdown-menu'; 
 
 // ------------ TYPES ------------ 
 type ContentType = 'text' | 'image' | 'video'; 
 type Platform = 'instagram' | 'facebook' | 'linkedin'; 
 type TextModel = 'llama' | 'gpt' | 'gemini'; 
 type ImageModel = 'qwen' | 'gpt' | 'gemini'; 
 type VideoModel = 'wan' | 'ltx' | 'veo3'; 
 type TextType = 'caption' | 'hashtags' | 'long-post'; 
 type AspectRatio = '1:1' | '4:5' | '9:16'; 
 type VideoType = 'short-video' | 'reel-script'  | 'script-only'; 
 type Duration = '5s' | '10s' | '15s'; 
 type Tone = 'professional' | 'casual'; 
 
 // ------------ SUGGESTIONS ------------ 
 const TEXT_SUGGESTIONS = [ 
   'Create a catchy Instagram caption about sustainable fashion', 
   'Write engaging hashtags for a tech startup launch', 
   'Draft a long-form LinkedIn post about remote work benefits', 
   'Generate a caption for a food photography post', 
   'Create hashtags for a fitness brand campaign', 
 ]; 
 
 const IMAGE_SUGGESTIONS = [ 
   'A minimalist workspace with natural lighting', 
   'Vibrant street art in an urban setting', 
   'Serene mountain landscape at sunset', 
   'Modern coffee shop interior design', 
   'Abstract geometric patterns in bold colors', 
 ]; 
 
 const VIDEO_SUGGESTIONS = [ 
   'A 15-second product demo showcasing key features', 
   'A quick tutorial on using the mobile app', 
   'Behind-the-scenes footage of a team meeting', 
   'A customer testimonial video script', 
   'A promotional video for a new service launch', 
 ]; 
 
 const MAX_VISIBLE_SUGGESTIONS = 6; 
 
 function normalizeForMatch(value: string) { 
   return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); 
 } 
 
 function getSuggestionScore(queryRaw: string, suggestionRaw: string) { 
   const query = normalizeForMatch(queryRaw); 
   const suggestion = normalizeForMatch(suggestionRaw); 
 
   if (!query) return 1; 
   if (!suggestion) return 0; 
 
   if (suggestion === query) return 200; 
   if (suggestion.startsWith(query)) return 160; 
   if (suggestion.includes(query)) return 120; 
 
   const queryTokens = query.split(' ').filter(Boolean); 
   if (queryTokens.length === 0) return 1; 
 
   let tokenScore = 0; 
   for (const token of queryTokens) { 
     if (token.length < 2) continue; 
     if (suggestion.includes(token)) tokenScore += 18; 
   } 
 
   if (tokenScore > 0) return tokenScore; 
 
   let sIdx = 0; 
   for (let qIdx = 0; qIdx < query.length; qIdx += 1) { 
     const ch = query[qIdx]; 
     sIdx = suggestion.indexOf(ch, sIdx); 
     if (sIdx === -1) return 0; 
     sIdx += 1; 
   } 
 
   return 40; 
 } 
 
 function renderHighlightedSuggestion(suggestion: string, queryRaw: string) { 
   const query = queryRaw.trim(); 
   if (query.length < 2) return suggestion; 
 
   const lowerSuggestion = suggestion.toLowerCase(); 
   const lowerQuery = query.toLowerCase(); 
   const matchIndex = lowerSuggestion.indexOf(lowerQuery); 
 
   if (matchIndex === -1) return suggestion; 
 
   const before = suggestion.slice(0, matchIndex); 
   const match = suggestion.slice(matchIndex, matchIndex + query.length); 
   const after = suggestion.slice(matchIndex + query.length); 
 
   return ( 
     <> 
       {before} 
       <span className="font-semibold text-gray-900">{match}</span> 
       {after} 
     </> 
   ); 
 } 
 
 export default function CreateContentPage() { 
   const searchParams = useSearchParams(); 
 
   // ---------------------------------------- 
   // STATE 
   // ---------------------------------------- 
   const [contentType, setContentType] = useState<ContentType | null>(null); 
   const [platform, setPlatform] = useState<Platform | null>(null); 
   const [textModel, setTextModel] = useState<TextModel>('llama'); 
   const [imageModel, setImageModel] = useState<ImageModel>('qwen'); 
   const [videoModel, setVideoModel] = useState<VideoModel>('wan'); 
 
   // Dynamic options state 
   const [textType, setTextType] = useState<TextType | null>(null); 
   const [tone, setTone] = useState<Tone>('professional'); 
   const [aspectRatio, setAspectRatio] = useState<AspectRatio | null>(null); 
   const [textOverlay, setTextOverlay] = useState<boolean | null>(null); 
   const [overlayText, setOverlayText] = useState(''); 
   const [videoType, setVideoType] = useState<VideoType | null>(null); 
   const [duration, setDuration] = useState<Duration | null>(null); 
 
   const [prompt, setPrompt] = useState(''); 
   const [output, setOutput] = useState<string | null>(null); 
   const [loading, setLoading] = useState(false); 
   const [jobId, setJobId] = useState<string | null>(null);
   const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
   const promptRef = useRef<HTMLTextAreaElement | null>(null); 
   const skipNextSuggestionFetchRef = useRef(false); 
   const lastSuggestionQueryRef = useRef<string>(''); 
   const [aiSuggestions, setAiSuggestions] = useState<string[]>([]); 
   const [suggestionsLoading, setSuggestionsLoading] = useState(false); 
   const [history, setHistory] = useState<PromptHistory[]>([]);
 
   const [selectedFiles, setSelectedFiles] = useState<{ 
     type: 'image' | 'video' | 'doc'; 
     file: File; 
     preview: string; 
   }[]>([]); 
 
   // Audio Recording State
   const [isRecording, setIsRecording] = useState(false);
   const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
   const [audioPreview, setAudioPreview] = useState<string | null>(null);
   const mediaRecorderRef = useRef<MediaRecorder | null>(null);
   const audioChunksRef = useRef<Blob[]>([]);
   const recognitionRef = useRef<any>(null);

   const imageInputRef = useRef<HTMLInputElement>(null); 
   const videoInputRef = useRef<HTMLInputElement>(null); 
   const docInputRef = useRef<HTMLInputElement>(null); 
 
   const [isEditing, setIsEditing] = useState(false); 
   const [loadedItem, setLoadedItem] = useState<ContentItem | null>(null); 
 
   useEffect(() => {
     fetchHistory();
   }, []);

   const fetchHistory = async () => {
     try {
       const { data } = await generationApi.getPromptHistory();
       setHistory(data);
     } catch (e) {
       console.error('Failed to fetch history', e);
     }
   };

   const clearHistory = async () => {
     try {
       await generationApi.clearPromptHistory();
       setHistory([]);
       toast.success('History cleared');
     } catch (e) {
       toast.error('Failed to clear history');
     }
   };

   useEffect(() => { 
     const id = searchParams.get('id'); 
     if (!id) return; 
 
     async function loadExistingContent() { 
       try { 
         const response = await contentApi.getContentById(id as string); 
         const item = response.data; 
 
         setLoadedItem(item); 
         setIsEditing(true); 
 
         let detectedType: ContentType | null = null; 
         if (item.type === 'text' || item.generatedText) detectedType = 'text'; 
         else if (item.type === 'image' || item.generatedImage) detectedType = 'image'; 
         else if (item.type === 'video' || item.generatedVideo) detectedType = 'video'; 
 
         if (detectedType) { 
           setContentType(detectedType); 
 
           // Best-effort defaults for dynamic options so UI does not look empty 
           if (detectedType === 'text') { 
             // We don't persist textType yet; default to caption for editing 
             setTextType('caption'); 
           } 
         } 
 
         if (item.platform) { 
           const lower = item.platform.toLowerCase(); 
           if (['instagram', 'facebook', 'linkedin'].includes(lower)) { 
             setPlatform(lower as Platform); 
           } 
         } 
 
         setPrompt(item.prompt || ''); 
 
         if (item.generatedText) setOutput(item.generatedText); 
        else if (item.generatedImage) setOutput(normalizeMediaUrl(item.generatedImage) || item.generatedImage); 
        else if (item.generatedVideo) setOutput(normalizeMediaUrl(item.generatedVideo) || item.generatedVideo); 
       } catch (err: any) { 
         console.error('Failed to load content for editing:', err); 
         toast.error(err.message || 'Failed to load content'); 
       } 
     } 
 
     loadExistingContent(); 
   }, [searchParams]); 
 
   // STEP VISIBILITY 
   const canShowStep2 = !!contentType; 
   const canShowStep3 = !!contentType && !!platform; 
   const canShowStep4 = !!contentType && !!platform && !!( 
     contentType === 'text' ? textType : 
     contentType === 'image' ? aspectRatio : 
     contentType === 'video' ? videoType && duration : null 
   ); 
   const canShowStep5 = canShowStep4; 
   const canShowStep6 = canShowStep4 && prompt.trim().length > 0; 
 
   const baseSuggestions = useMemo(() => { 
     if (contentType === 'text') return TEXT_SUGGESTIONS; 
     if (contentType === 'image') return IMAGE_SUGGESTIONS; 
     if (contentType === 'video') return VIDEO_SUGGESTIONS; 
     return []; 
   }, [contentType]); 
 
   useEffect(() => { 
     if (!canShowStep5 || !contentType || !platform) { 
       setAiSuggestions([]); 
       setSuggestionsLoading(false); 
       lastSuggestionQueryRef.current = ''; 
       return; 
     } 
 
     const query = prompt.trim(); 
     if (skipNextSuggestionFetchRef.current) { 
       skipNextSuggestionFetchRef.current = false; 
       return; 
     } 
 
     if (query.length < 8) { 
       setAiSuggestions([]); 
       setSuggestionsLoading(false); 
       lastSuggestionQueryRef.current = ''; 
       return; 
     } 
 
     const signature = JSON.stringify({ 
       query, 
       contentType, 
       platform, 
       textType, 
       tone, 
       aspectRatio, 
       textOverlay, 
       overlayText, 
       videoType, 
       duration, 
     }); 
 
     if (lastSuggestionQueryRef.current === signature) return; 
     lastSuggestionQueryRef.current = signature; 
 
     let cancelled = false; 
     const timeout = setTimeout(async () => { 
       try { 
         setSuggestionsLoading(true); 
         const response = await contentApi.promptSuggestions({ 
           type: contentType, 
           platform, 
           prompt: query, 
           textType: contentType === 'text' ? textType : undefined, 
           tone: contentType === 'text' ? tone : undefined, 
           aspectRatio: contentType === 'image' ? aspectRatio : undefined, 
           textOverlay: contentType === 'image' ? textOverlay : undefined, 
           overlayText: contentType === 'image' && textOverlay ? overlayText : undefined, 
           videoType: contentType === 'video' ? videoType : undefined, 
           duration: contentType === 'video' ? duration : undefined, 
         }); 
 
         const suggestions = (response.data?.suggestions || []).filter( 
           (s: unknown) => typeof s === 'string' && s.trim().length > 0 
         ) as string[]; 
 
         if (!cancelled) setAiSuggestions(suggestions); 
       } catch { 
         if (!cancelled) setAiSuggestions([]); 
       } finally { 
         if (!cancelled) setSuggestionsLoading(false); 
       } 
     }, 400); 
 
     return () => { 
       cancelled = true; 
       clearTimeout(timeout); 
     }; 
   }, [ 
     canShowStep5, 
     contentType, 
     platform, 
     prompt, 
     textType, 
     tone, 
     aspectRatio, 
     textOverlay, 
     overlayText, 
     videoType, 
     duration, 
   ]); 
 
   const allSuggestions = useMemo(() => { 
     const merged = [...aiSuggestions, ...baseSuggestions]; 
     const unique: string[] = []; 
     const seen = new Set<string>(); 
     for (const s of merged) { 
       const key = s.trim().toLowerCase(); 
       if (!key) continue; 
       if (seen.has(key)) continue; 
       seen.add(key); 
       unique.push(s); 
     } 
     return unique; 
   }, [aiSuggestions, baseSuggestions]); 
 
   const { visibleSuggestions, highlightQuery } = useMemo(() => { 
     const query = prompt.trim(); 
     if (!query) { 
       return { 
         visibleSuggestions: allSuggestions.slice(0, MAX_VISIBLE_SUGGESTIONS), 
         highlightQuery: '', 
       }; 
     } 
 
     if (query.length < 2) { 
       return { 
         visibleSuggestions: allSuggestions.slice(0, MAX_VISIBLE_SUGGESTIONS), 
         highlightQuery: '', 
       }; 
     } 
 
     const ranked = allSuggestions 
       .map((suggestion, index) => ({ 
         suggestion, 
         index, 
         score: getSuggestionScore(query, suggestion), 
       })) 
       .filter((item) => item.score > 0) 
       .sort((a, b) => b.score - a.score || a.index - b.index) 
       .slice(0, MAX_VISIBLE_SUGGESTIONS) 
       .map((item) => item.suggestion); 
 
     if (ranked.length > 0) { 
       return { visibleSuggestions: ranked, highlightQuery: query }; 
     } 
 
     return { 
       visibleSuggestions: allSuggestions.slice(0, Math.min(3, allSuggestions.length)), 
       highlightQuery: '', 
     }; 
   }, [allSuggestions, prompt]); 
 
   // ---------------------------------------- 
   // HANDLERS 
   // ---------------------------------------- 
   const handleSuggestionClick = (suggestion: string) => { 
     skipNextSuggestionFetchRef.current = true; 
     setPrompt(suggestion); 
     queueMicrotask(() => promptRef.current?.focus()); 
   }; 

  const getBackendBaseUrl = () =>
    process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

  const normalizeMediaUrl = (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith('data:')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base = getBackendBaseUrl().replace(/\/$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  };

  async function pollVideoStatus(id: string) {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await videoApi.getVideoStatus(id);
        const video = response.data;
        if (video.status === 'done' && video.videoUrl) {
          clearInterval(pollIntervalRef.current!);
          setOutput(normalizeMediaUrl(video.videoUrl) || null);
          setLoading(false);
          setJobId(null);
          toast.success('Video generated successfully!');
        } else if (video.status === 'failed') {
          clearInterval(pollIntervalRef.current!);
          setLoading(false);
          setJobId(null);
          toast.error('Video generation failed.');
        }
      } catch (err: any) {
        clearInterval(pollIntervalRef.current!);
        setLoading(false);
        setJobId(null);
        toast.error(err.response?.data?.message || 'Error polling video status');
      }
    }, 3000);
  }
 
   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'doc') => { 
     const files = Array.from(e.target.files || []); 
     if (files.length === 0) return; 
 
     const newFiles = files.map(file => ({ 
       type, 
       file, 
       preview: URL.createObjectURL(file) 
     })); 
 
     setSelectedFiles(prev => [...prev, ...newFiles]); 
     toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} added!`); 
     // Reset input value so same file can be selected again if removed 
     e.target.value = ''; 
   }; 
 
   const removeFile = (index: number) => { 
     setSelectedFiles(prev => { 
       const fileToRemove = prev[index]; 
       if (fileToRemove.preview.startsWith('blob:')) { 
         URL.revokeObjectURL(fileToRemove.preview); 
       } 
       return prev.filter((_, i) => i !== index); 
     }); 
   }; 
 
   // Audio Recording Handlers
   const startRecording = async () => {
     try {
       // Check if browser supports mediaDevices
       if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
         toast.error('Your browser does not support audio recording. Please use a modern browser.');
         return;
       }

       // SpeechRecognition is strict about HTTPS (except for localhost)
       const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
       if (!isSecure) {
         toast.error('Microphone and speech features require a secure (HTTPS) connection.');
         return;
       }

       // 1. Request Media Stream first (this is the most common permission trigger)
       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
       
       // 2. Once stream is granted, start MediaRecorder
       const mediaRecorder = new MediaRecorder(stream);
       mediaRecorderRef.current = mediaRecorder;
       audioChunksRef.current = [];

       mediaRecorder.ondataavailable = (event) => {
         if (event.data.size > 0) {
           audioChunksRef.current.push(event.data);
         }
       };

       mediaRecorder.onstop = () => {
         const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
         const url = URL.createObjectURL(blob);
         setAudioBlob(blob);
         setAudioPreview(url);
         toast.success('Audio recorded!');
       };

       mediaRecorder.start();

       // 3. Then start Speech Recognition (using the already-granted permission context)
       const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
       if (SpeechRecognition) {
         try {
           const recognition = new SpeechRecognition();
           recognition.continuous = true;
           recognition.interimResults = true;
           recognition.lang = 'en-US';

           recognition.onresult = (event: any) => {
             for (let i = event.resultIndex; i < event.results.length; ++i) {
               if (event.results[i].isFinal) {
                 setPrompt(prev => {
                   const newText = event.results[i][0].transcript;
                   return prev.endsWith(' ') || !prev ? prev + newText : prev + ' ' + newText;
                 });
               }
             }
           };

           recognition.onerror = (event: any) => {
             // Use warn/info instead of error to avoid triggering Next.js error overlay
             console.warn('Speech recognition warning:', event.error);
             
             if (event.error === 'not-allowed') {
               toast.error('Speech-to-text permission was not granted.');
             } else if (event.error === 'network') {
               toast.error('Speech-to-text network error.');
             }
             // Don't stop everything if just transcription fails, 
             // let the user continue recording the audio file.
           };

           recognition.start();
           recognitionRef.current = recognition;
         } catch (recognitionErr) {
           console.warn('Could not start speech recognition:', recognitionErr);
         }
       }

       setIsRecording(true);
     } catch (err: any) {
       // Use warn instead of error to avoid triggering Next.js error overlay
       console.warn('Error starting recording:', err);
       
       if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
         toast.error('Microphone access denied. Please enable microphone permissions in your browser settings.');
       } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('device not found')) {
         toast.error('No microphone found. Please connect a microphone and try again.');
       } else {
         toast.error('Could not access microphone. Please ensure your device is connected and permissions are granted.');
       }
       
       // Ensure UI state is reset if recording failed to start
       setIsRecording(false);
       if (recognitionRef.current) {
         recognitionRef.current.stop();
         recognitionRef.current = null;
       }
     }
   };

   const stopRecording = () => {
     if (mediaRecorderRef.current && isRecording) {
       mediaRecorderRef.current.stop();
       mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
     }
     if (recognitionRef.current) {
       recognitionRef.current.stop();
       recognitionRef.current = null;
     }
     setIsRecording(false);
   };

   const removeAudio = () => {
     if (audioPreview) URL.revokeObjectURL(audioPreview);
     setAudioBlob(null);
     setAudioPreview(null);
   };

   // Helper to convert file to base64
   const fileToBase64 = (file: File | Blob): Promise<string> => {
     return new Promise((resolve, reject) => {
       const reader = new FileReader();
       reader.readAsDataURL(file);
       reader.onload = () => resolve(reader.result as string);
       reader.onerror = error => reject(error);
     });
   };

   async function handleGenerate() { 
     if (!contentType || !platform || !prompt.trim()) { 
       toast.error('Please complete all required steps.'); 
       return; 
     } 
 
     // Validate dynamic options 
     if (contentType === 'text' && !textType) { 
       toast.error('Please select a text type.'); 
       return; 
     } 
     if (contentType === 'image' && !aspectRatio) { 
       toast.error('Please select an aspect ratio.'); 
       return; 
     } 
     if (contentType === 'video' && (!videoType || !duration)) { 
       toast.error('Please complete video options.'); 
       return; 
     } 
 
     setLoading(true); 
     setOutput(null); 
 
     try { 
       if (contentType === 'video') {
        const durationValue = parseInt(duration?.replace('s', '') || '5');

        // Short-video generates an actual MP4 via the video service.
        const attachedImages = selectedFiles.filter(f => f.type === 'image');
        let videoTypeToUse: 'text' | 'image' | 'multi-image' | 'audio' = 'text';
        let imagesBase64: string[] | undefined = undefined;
        let audioBase64: string | undefined = undefined;

        if (audioBlob) {
          videoTypeToUse = 'audio';
          audioBase64 = await fileToBase64(audioBlob);
        } else if (attachedImages.length === 1) {
          videoTypeToUse = 'image';
          imagesBase64 = [await fileToBase64(attachedImages[0].file)];
        } else if (attachedImages.length > 1) {
          videoTypeToUse = 'multi-image';
          imagesBase64 = await Promise.all(attachedImages.map(f => fileToBase64(f.file)));
        }

        // Script-only / Reel-script are TEXT outputs (scripts), unless we have images/audio
        // If we have images or audio, we force 'short-video' behavior (actual MP4 generation)
        const isActuallyVideo = videoType === 'short-video' || videoTypeToUse !== 'text';

        if (!isActuallyVideo) {
          const response = await contentApi.generateContent({
            type: 'video',
            platform,
            model: 'wan',
            prompt,
            videoType,
            duration,
          });
          setOutput(
            response.data.output ||
              response.data.generatedText ||
              'Script generated successfully!',
          );
          setLoading(false);
          toast.success('Script generated!');
          return;
        }

        const response = await videoApi.generateVideo({
          prompt,
          type: videoTypeToUse,
          images: imagesBase64,
          audio: audioBase64,
          duration: durationValue as 5 | 10 | 15,
          model: videoModel, // Use the selected video model
          platform,
        });
        const video = response.data;
        if (video.videoUrl) {
          setOutput(normalizeMediaUrl(video.videoUrl) || null);
          setLoading(false);
          toast.success('Video generated!');
        } else {
          setJobId(video.id);
          pollVideoStatus(video.id);
          toast.info('Video is being processed...');
        }
       } else {
         const model = contentType === 'text' ? textModel : 
                      contentType === 'image' ? imageModel : null; 
   
         const attachedImages = selectedFiles.filter(f => f.type === 'image');
         const imagesBase64 = attachedImages.length > 0 
           ? await Promise.all(attachedImages.map(f => fileToBase64(f.file)))
           : undefined;
         const audioBase64 = audioBlob ? await fileToBase64(audioBlob) : undefined;

         const response = await contentApi.generateContent({ 
           type: contentType, 
           platform, 
           model, 
           prompt, 
           textType: contentType === 'text' ? textType : undefined, 
           tone: contentType === 'text' ? tone : undefined, 
           aspectRatio: contentType === 'image' ? aspectRatio : undefined, 
           textOverlay: contentType === 'image' ? textOverlay : undefined, 
           overlayText: contentType === 'image' && textOverlay ? overlayText : undefined, 
           images: imagesBase64,
           audio: audioBase64,
         }); 
   
         const generatedOutput = response.data.output || response.data.generatedText || response.data.generatedImage || 'Content generated successfully!';
         setOutput(contentType === 'text' ? generatedOutput : normalizeMediaUrl(generatedOutput) || generatedOutput);
         setLoading(false);
         toast.success('Content generated!'); 

         // Refresh history after a short delay to allow the backend to save it
         setTimeout(fetchHistory, 2000);
       }
     } catch (err: any) { 
       toast.error(err.message || 'Something went wrong'); 
       setLoading(false);
     } 
   } 
 
   function handleCopy() { 
     if (output) { 
       navigator.clipboard.writeText(output); 
       toast.success('Copied to clipboard!'); 
     } 
   } 
 
   function handleRegenerate() { 
     handleGenerate(); 
   } 
 
   async function handleSave() { 
     if (!output) { 
       toast.error('No content to save.'); 
       return; 
     } 
 
     try { 
       await contentApi.saveContent({ 
         type: contentType, 
         platform, 
         prompt, 
         generatedText: contentType === 'text' ? output : undefined, 
         generatedImage: contentType === 'image' ? output : undefined, 
        generatedVideo:
          contentType === 'video' &&
          (output.startsWith('data:video') || output.startsWith('http'))
            ? output
            : undefined,
        generatedText:
          contentType === 'video' &&
          !(output.startsWith('data:video') || output.startsWith('http'))
            ? output
            : contentType === 'text'
              ? output
              : undefined,
         status: 'draft', 
       }); 
       toast.success('Saved to library!'); 
     } catch (err: any) { 
       toast.error(err.message || 'Failed to save content'); 
     } 
   } 
 
   // Reset when content type changes 
   const handleContentTypeChange = (type: ContentType) => { 
     setContentType(type); 
     setPlatform(null); 
     setTextType(null); 
     setTone('professional'); 
     setAspectRatio(null); 
     setTextOverlay(null); 
     setOverlayText(''); 
     setVideoType(null); 
     setDuration(null); 
     setPrompt(''); 
     setOutput(null); 
   }; 
 
   return ( 
     <DashboardLayout title="Create Content"> 
       <div className="flex gap-4 h-full p-6"> 
         {/* LEFT SIDE - Main Content Form */} 
         <div className="flex-1 space-y-3"> 
           <h1 className="text-xl font-bold">Create Content</h1> 
           
           {/* STEP 1 — Content Type */} 
           <Card> 
             <CardHeader className="pb-3"> 
               <CardTitle className="text-base font-semibold">Step 1: Content Type</CardTitle> 
             </CardHeader> 
             <CardContent> 
               <div className="flex gap-2"> 
                 <button 
                   onClick={() => handleContentTypeChange('text')} 
                   className={`flex-1 p-3 border-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                     contentType === 'text' 
                       ? 'border-purple-500 bg-purple-50' 
                       : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                   }`} 
                 > 
                   <div className="flex flex-col items-center space-y-1"> 
                     <div className="text-xl">✏️</div> 
                     <div className="text-xs font-semibold text-gray-900">Text</div> 
                   </div> 
                 </button> 
 
                 <button 
                   onClick={() => handleContentTypeChange('image')} 
                   className={`flex-1 p-3 border-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                     contentType === 'image' 
                       ? 'border-purple-500 bg-purple-50' 
                       : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                   }`} 
                 > 
                   <div className="flex flex-col items-center space-y-1"> 
                     <div className="text-xl">🖼</div> 
                     <div className="text-xs font-semibold text-gray-900">Image</div> 
                   </div> 
                 </button> 
 
                 <button 
                   onClick={() => handleContentTypeChange('video')} 
                   className={`flex-1 p-3 border-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                     contentType === 'video' 
                       ? 'border-purple-500 bg-purple-50' 
                       : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                   }`} 
                 > 
                   <div className="flex flex-col items-center space-y-1"> 
                     <div className="text-xl">🎥</div> 
                     <div className="text-xs font-semibold text-gray-900">Video</div> 
                   </div> 
                 </button> 
               </div> 
             </CardContent> 
           </Card> 
 
           {/* STEP 2 — Platform */} 
           {canShowStep2 && ( 
             <Card> 
               <CardHeader className="pb-3"> 
                 <CardTitle className="text-base font-semibold">Step 2: Platform</CardTitle> 
               </CardHeader> 
               <CardContent> 
                 <div className="flex gap-2"> 
                   <button 
                     onClick={() => setPlatform('instagram')} 
                     className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                       platform === 'instagram' 
                         ? 'border-purple-500 bg-purple-50' 
                         : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                     }`} 
                   > 
                     <div className="text-xs font-semibold text-gray-900">Instagram</div> 
                   </button> 
                   <button 
                     onClick={() => setPlatform('facebook')} 
                     className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                       platform === 'facebook' 
                         ? 'border-purple-500 bg-purple-50' 
                         : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                     }`} 
                   > 
                     <div className="text-xs font-semibold text-gray-900">Facebook</div> 
                   </button> 
                   <button 
                     onClick={() => setPlatform('linkedin')} 
                     className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                       platform === 'linkedin' 
                         ? 'border-purple-500 bg-purple-50' 
                         : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                     }`} 
                   > 
                     <div className="text-xs font-semibold text-gray-900">LinkedIn</div> 
                   </button> 
                 </div> 
               </CardContent> 
             </Card> 
           )} 
 
           {/* STEP 3 — Dynamic Options */} 
           {canShowStep3 && ( 
             <Card> 
               <CardHeader className="pb-3"> 
                 <CardTitle className="text-base font-semibold"> 
                   Step 3: {contentType === 'text' && 'Text Type'} 
                   {contentType === 'image' && 'Aspect Ratio'} 
                   {contentType === 'video' && 'Video Type'} 
                 </CardTitle> 
               </CardHeader> 
               <CardContent className="space-y-3"> 
                 {contentType === 'text' && ( 
                   <div className="space-y-3"> 
                     <div className="flex gap-2"> 
                       <button 
                         onClick={() => setTextType('caption')} 
                         className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                           textType === 'caption' 
                             ? 'border-purple-500 bg-purple-50' 
                             : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                         }`} 
                       > 
                         <div className="text-xs font-semibold text-gray-900">Caption</div> 
                       </button> 
                       <button 
                         onClick={() => setTextType('hashtags')} 
                         className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                           textType === 'hashtags' 
                             ? 'border-purple-500 bg-purple-50' 
                             : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                         }`} 
                       > 
                         <div className="text-xs font-semibold text-gray-900">Hashtags</div> 
                       </button> 
                       <button 
                         onClick={() => setTextType('long-post')} 
                         className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                           textType === 'long-post' 
                             ? 'border-purple-500 bg-purple-50' 
                             : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                         }`} 
                       > 
                         <div className="text-xs font-semibold text-gray-900">Long Post</div> 
                       </button> 
                     </div> 
 
                     <div> 
                       <label className="text-xs font-medium text-gray-700 mb-1.5 block">Tone</label> 
                       <div className="flex gap-2"> 
                         <button 
                           onClick={() => setTone('professional')} 
                           className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                             tone === 'professional' 
                               ? 'border-purple-500 bg-purple-50' 
                               : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                           }`} 
                         > 
                           <div className="text-xs font-semibold text-gray-900">Professional</div> 
                         </button> 
                         <button 
                           onClick={() => setTone('casual')} 
                           className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                             tone === 'casual' 
                               ? 'border-purple-500 bg-purple-50' 
                               : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                           }`} 
                         > 
                           <div className="text-xs font-semibold text-gray-900">Casual</div> 
                         </button> 
                       </div> 
                     </div> 
                   </div> 
                 )} 
 
                 {contentType === 'image' && ( 
                   <div className="space-y-3"> 
                     <div className="flex gap-2"> 
                       <button 
                         onClick={() => setAspectRatio('1:1')} 
                         className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                           aspectRatio === '1:1' 
                             ? 'border-purple-500 bg-purple-50' 
                             : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                         }`} 
                       > 
                         <div className="text-xs font-semibold text-gray-900">1:1</div> 
                       </button> 
                       <button 
                         onClick={() => setAspectRatio('4:5')} 
                         className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                           aspectRatio === '4:5' 
                             ? 'border-purple-500 bg-purple-50' 
                             : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                         }`} 
                       > 
                         <div className="text-xs font-semibold text-gray-900">4:5</div> 
                       </button> 
                       <button 
                         onClick={() => setAspectRatio('9:16')} 
                         className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                           aspectRatio === '9:16' 
                             ? 'border-purple-500 bg-purple-50' 
                             : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                         }`} 
                       > 
                         <div className="text-xs font-semibold text-gray-900">9:16</div> 
                       </button> 
                     </div> 
                   </div> 
                 )} 
 
                 {contentType === 'video' && ( 
                   <div className="space-y-3"> 
                     <div className="flex gap-2"> 
                       <button 
                         onClick={() => setVideoType('reel-script')} 
                         className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                           videoType === 'reel-script' 
                             ? 'border-purple-500 bg-purple-50' 
                             : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                         }`} 
                       > 
                         <div className="text-xs font-semibold text-gray-900">Reel Script</div> 
                       </button> 
                       <button 
                         onClick={() => setVideoType('short-video')} 
                         className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                           videoType === 'short-video' 
                             ? 'border-purple-500 bg-purple-50' 
                             : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                         }`} 
                       > 
                         <div className="text-xs font-semibold text-gray-900">Short Video</div> 
                       </button> 
                       <button 
                         onClick={() => setVideoType('script-only')} 
                         className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                           videoType === 'script-only' 
                             ? 'border-purple-500 bg-purple-50' 
                             : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                         }`} 
                       > 
                         <div className="text-xs font-semibold text-gray-900">Script Only</div> 
                       </button> 
                     </div> 
 
                     {videoType && videoType !== 'script-only' && (
                        <div> 
                          <label className="text-xs font-medium text-gray-700 mb-1.5 block">Duration</label> 
                          <div className="flex gap-2"> 
                            <button 
                              onClick={() => setDuration('5s')} 
                              className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                                duration === '5s' 
                                  ? 'border-purple-500 bg-purple-50' 
                                  : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                              }`} 
                            > 
                              <div className="text-xs font-semibold text-gray-900">5s</div> 
                            </button> 
                            <button 
                              onClick={() => setDuration('10s')} 
                              className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                                duration === '10s' 
                                  ? 'border-purple-500 bg-purple-50' 
                                  : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                              }`} 
                            > 
                              <div className="text-xs font-semibold text-gray-900">10s</div> 
                            </button> 
                            <button 
                              onClick={() => setDuration('15s')} 
                              className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                                duration === '15s' 
                                  ? 'border-purple-500 bg-purple-50' 
                                  : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                              }`} 
                            > 
                              <div className="text-xs font-semibold text-gray-900">15s</div> 
                            </button> 
                          </div> 
                        </div> 
                     )}
                   </div> 
                 )} 
               </CardContent> 
             </Card> 
           )} 
 
           {/* STEP 4 — AI Model */} 
           {canShowStep4 && ( 
             <Card> 
               <CardHeader className="pb-3"> 
                 <CardTitle className="text-base font-semibold">Step 4: AI Model</CardTitle> 
               </CardHeader> 
               <CardContent> 
                 {contentType === 'text' && ( 
                   <div className="flex gap-2"> 
                     <button 
                       onClick={() => setTextModel('llama')} 
                       className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                         textModel === 'llama' 
                           ? 'border-purple-500 bg-purple-50' 
                           : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                       }`} 
                     > 
                       <div className="text-xs font-semibold text-gray-900">LLaMA</div> 
                     </button> 
                     <button 
                       onClick={() => setTextModel('gpt')}
                       className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                         textModel === 'gpt'
                           ? 'border-purple-500 bg-purple-50'
                           : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50'
                       }`}
                     > 
                       <div className="text-xs font-semibold text-gray-900">GPT</div> 
                     </button> 
                     <button 
                      onClick={() => setTextModel('gemini')}
                      className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                        textModel === 'gemini'
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50'
                      }`}
                     > 
                      <div className="text-xs font-semibold text-gray-900">Gemini</div>
                     </button> 
                   </div> 
                 )} 
 
                 {contentType === 'image' && ( 
                   <div className="flex gap-2"> 
                     <button 
                       onClick={() => setImageModel('qwen')} 
                       className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                         imageModel === 'qwen' 
                           ? 'border-purple-500 bg-purple-50' 
                           : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                       }`} 
                     > 
                       <div className="text-xs font-semibold text-gray-900">Qwen</div> 
                     </button> 
                     <button 
                       disabled 
                       className="flex-1 p-2 border-2 rounded-full bg-gray-100 opacity-50 cursor-not-allowed" 
                     > 
                       <div className="text-xs font-semibold text-gray-500">GPT</div> 
                     </button> 
                     <button 
                      onClick={() => setImageModel('gemini')}
                      className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                        imageModel === 'gemini'
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50'
                      }`}
                     > 
                      <div className="text-xs font-semibold text-gray-900">Gemini</div>
                     </button> 
                   </div> 
                 )} 
 
                 {contentType === 'video' && ( 
                   <div className="flex gap-2"> 
                     <button 
                       onClick={() => setVideoModel('wan')} 
                       className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${ 
                         videoModel === 'wan' 
                           ? 'border-purple-500 bg-purple-50' 
                           : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50' 
                       }`} 
                     > 
                       <div className="text-xs font-semibold text-gray-900">WAN</div> 
                     </button> 
                     <button 
                       disabled 
                       className="flex-1 p-2 border-2 rounded-full bg-gray-100 opacity-50 cursor-not-allowed" 
                     > 
                       <div className="text-xs font-semibold text-gray-500">LTX</div> 
                     </button> 
                    <button
                      onClick={() => setVideoModel('veo3')}
                      className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                        videoModel === 'veo3'
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50'
                      }`}
                    >
                      <div className="text-xs font-semibold text-gray-900">VEO3</div>
                    </button>
                   </div> 
                 )} 
               </CardContent> 
             </Card> 
           )} 
 
           {/* STEP 5 — Prompt + Suggestions */} 
           {canShowStep5 && ( 
             <Card className="border-none shadow-none bg-transparent"> 
               <CardContent className="p-0 space-y-4"> 
                 {/* Hidden File Inputs */} 
                 <input 
                   type="file" 
                   ref={imageInputRef} 
                   onChange={(e) => handleFileSelect(e, 'image')} 
                   accept="image/*" 
                   multiple 
                   className="hidden" 
                 /> 
                 <input 
                   type="file" 
                   ref={videoInputRef} 
                   onChange={(e) => handleFileSelect(e, 'video')} 
                   accept="video/*" 
                   multiple 
                   className="hidden" 
                 /> 
                 <input 
                   type="file" 
                   ref={docInputRef} 
                   onChange={(e) => handleFileSelect(e, 'doc')} 
                   accept=".pdf,.doc,.docx,.txt" 
                   multiple 
                   className="hidden" 
                 /> 
 
                 <div className="flex flex-col w-full rounded-[32px] border border-gray-200 bg-[#f4f4f4] p-2 focus-within:border-gray-300 focus-within:bg-white focus-within:ring-0 transition-all shadow-sm"> 
                   {/* Selected Files Previews (Top - ChatGPT Style) */} 
                   {(selectedFiles.length > 0 || audioPreview) && ( 
                     <div className="flex flex-wrap gap-3 p-3 mb-1"> 
                       {selectedFiles.map((file, idx) => ( 
                         <div key={idx} className="relative group w-16 h-16 rounded-2xl border border-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-100"> 
                           {file.type === 'image' ? ( 
                             <img src={file.preview} alt="preview" className="w-full h-full object-cover" /> 
                           ) : file.type === 'video' ? ( 
                             <div className="w-full h-full flex items-center justify-center bg-gray-900"> 
                               <FileVideo className="h-6 w-6 text-white" /> 
                             </div> 
                           ) : ( 
                             <div className="w-full h-full flex items-center justify-center bg-gray-50"> 
                               <FileText className="h-6 w-6 text-gray-400" /> 
                             </div> 
                           )} 
                           <button 
                             onClick={() => removeFile(idx)} 
                             className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10" 
                           > 
                             <X className="h-3.5 w-3.5" /> 
                           </button> 
                         </div> 
                       ))} 

                       {/* Audio Preview */}
                       {audioPreview && (
                         <div className="relative group w-32 h-16 rounded-2xl border border-purple-100 overflow-hidden bg-purple-50 shadow-sm ring-1 ring-purple-100 flex flex-col items-center justify-center p-2">
                           <div className="flex items-center gap-2 mb-1">
                             <Mic className="h-4 w-4 text-purple-500" />
                             <span className="text-[10px] font-medium text-purple-700">Audio clip</span>
                           </div>
                           <audio src={audioPreview} controls className="h-6 w-full scale-75 origin-center" />
                           <button 
                             onClick={removeAudio} 
                             className="absolute top-1 right-1 bg-white/80 hover:bg-white text-purple-600 rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10" 
                           > 
                             <X className="h-3 w-3" /> 
                           </button> 
                         </div>
                       )}
                     </div> 
                   )} 
 
                   <div className="flex items-center gap-3 px-2 pb-1"> 
                     {/* Plus Button on Left */} 
                     <div className="flex-shrink-0"> 
                       <DropdownMenu> 
                         <DropdownMenuTrigger asChild> 
                           <Button 
                             variant="ghost" 
                             size="icon" 
                             className="h-10 w-10 rounded-full hover:bg-gray-200/50 text-gray-500 transition-colors" 
                           > 
                             <Plus className="h-6 w-6" /> 
                           </Button> 
                         </DropdownMenuTrigger> 
                         <DropdownMenuContent align="start" className="w-64 p-2 rounded-[20px] shadow-2xl border-gray-100 bg-white/95 backdrop-blur-lg"> 
                           <DropdownMenuItem 
                             onClick={() => {
                               setContentType('video');
                               imageInputRef.current?.click();
                             }} 
                             className="cursor-pointer rounded-xl focus:bg-gray-100 hover:bg-gray-100 py-3 px-4 mb-1 transition-all group" 
                           > 
                             <Paperclip className="h-5 w-5 mr-4 text-gray-500 group-hover:text-purple-600 transition-colors" /> 
                             <span className="text-[15px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Add photos & files</span> 
                           </DropdownMenuItem> 
                           <DropdownMenuItem 
                             onClick={() => setContentType('image')} 
                             className="cursor-pointer rounded-xl focus:bg-gray-100 hover:bg-gray-100 py-3 px-4 transition-all group" 
                           > 
                             <ImageIcon className="h-5 w-5 mr-4 text-gray-500 group-hover:text-purple-600 transition-colors" /> 
                             <span className="text-[15px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Create image</span> 
                           </DropdownMenuItem> 
                         </DropdownMenuContent> 
                       </DropdownMenu> 
                     </div> 
 
                     {/* Modern Textarea */} 
                     <textarea 
                       value={prompt} 
                       onChange={(e) => setPrompt(e.target.value)} 
                       placeholder={isRecording ? "Listening... speak now" : "Ask anything"} 
                       className={`flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-[16px] min-h-[48px] max-h-[200px] py-3.5 resize-none placeholder:text-gray-400 leading-normal scrollbar-hide ${isRecording ? 'text-purple-600 font-medium' : ''}`} 
                       ref={promptRef as any} 
                       rows={1} 
                       onInput={(e) => { 
                         const target = e.target as HTMLTextAreaElement; 
                         target.style.height = 'auto'; 
                         target.style.height = `${target.scrollHeight}px`; 
                       }} 
                     /> 
 
                     {/* Right Side Icons */} 
                     <div className="flex items-center gap-2 flex-shrink-0 px-1"> 
                       {isRecording && (
                         <div className="flex gap-0.5 items-center px-2 h-10">
                           <div className="w-1 h-4 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                           <div className="w-1 h-6 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                           <div className="w-1 h-4 bg-purple-500 rounded-full animate-bounce" />
                         </div>
                       )}
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         onClick={() => {
                           if (!isRecording) {
                             // Don't force video mode if user is just talking to fill prompt
                             // setContentType('video'); 
                             startRecording();
                           } else {
                             stopRecording();
                           }
                         }}
                         className={`h-10 w-10 rounded-full transition-colors ${
                           isRecording 
                             ? 'bg-red-50 text-red-500 hover:bg-red-100' 
                             : 'hover:bg-gray-200/50 text-gray-500'
                         }`}
                       > 
                         <Mic className={`h-5 w-5 ${isRecording ? 'animate-pulse' : ''}`} /> 
                       </Button> 
                       <Button 
                         onClick={handleGenerate} 
                         disabled={loading || (!prompt.trim() && !audioBlob && selectedFiles.filter(f => f.type === 'image').length === 0)} 
                         className={`h-10 w-10 rounded-full p-0 flex items-center justify-center transition-all shadow-sm ${ 
                           prompt.trim() || audioBlob || selectedFiles.filter(f => f.type === 'image').length > 0
                             ? 'bg-black text-white hover:bg-gray-800' 
                             : 'bg-gray-300 text-gray-500' 
                         }`} 
                       > 
                         {loading ? ( 
                           <Loader2 className="h-5 w-5 animate-spin" /> 
                         ) : ( 
                           <ArrowUp className="h-6 w-6" /> 
                         )} 
                       </Button> 
                     </div> 
                   </div> 
                 </div> 
 
                 {/* Optional Overlay Text for images */} 
                 {contentType === 'image' && ( 
                   <div className="space-y-1.5 px-4 pt-1"> 
                     <label className="text-xs font-medium text-gray-700">Overlay Text (optional)</label> 
                     <Input 
                       value={overlayText} 
                       onChange={(e) => { 
                         const value = e.target.value; 
                         setOverlayText(value); 
                         setTextOverlay(value.trim().length > 0 ? true : null); 
                       }} 
                       placeholder="Enter overlay text (will be placed on top of the image)" 
                       className="h-10 rounded-xl text-sm border-gray-200 focus:border-purple-400 focus:ring-purple-100 transition-all" 
                     /> 
                   </div> 
                 )} 
 
                 {visibleSuggestions.length > 0 && ( 
                   <div className="space-y-4 pt-4 border-t border-gray-50 mt-4"> 
                     {/* Popular Suggestions */}
                     <div className="space-y-2">
                       <div className="flex items-center justify-between px-4"> 
                         <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest"> 
                           <Sparkles className="w-3 h-3 text-purple-500" />
                           Popular Suggestions
                         </div> 
                         {suggestionsLoading && ( 
                           <div className="flex items-center gap-2"> 
                             <Loader2 className="h-3 w-3 animate-spin text-purple-500" /> 
                             <span className="text-[11px] text-gray-400 italic">AI thinking…</span> 
                           </div> 
                         )} 
                       </div> 
                       <div className="grid grid-cols-1 gap-2 px-4"> 
                         {visibleSuggestions.map((suggestion, index) => ( 
                           <button 
                             key={index} 
                             onClick={() => handleSuggestionClick(suggestion)} 
                             className="text-left px-4 py-3 border border-gray-100 rounded-2xl hover:border-purple-200 hover:bg-purple-50/30 transition-all duration-200 text-[14px] text-gray-600 group flex items-center justify-between shadow-sm" 
                           > 
                             <span className="flex-1 truncate">
                               {suggestion}
                             </span> 
                             <Plus className="h-4 w-4 text-gray-300 group-hover:text-purple-400 transition-colors ml-3 flex-shrink-0" /> 
                           </button> 
                         ))} 
                       </div> 
                     </div>

                     {/* Recent Prompts (History) */}
                     {history.length > 0 && (
                       <div className="space-y-2">
                         <div className="flex items-center justify-between px-4"> 
                           <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest"> 
                             <History className="w-3 h-3 text-blue-500" />
                             Recent Prompts
                           </div> 
                           <button
                             onClick={clearHistory}
                             className="text-[10px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
                           >
                             <X className="w-2.5 h-2.5" />
                             Clear
                           </button>
                         </div> 
                         <div className="grid grid-cols-1 gap-2 px-4"> 
                           {history.map((h, index) => ( 
                             <button 
                               key={h.id || index} 
                               onClick={() => {
                                 setPrompt(h.prompt);
                                 if (h.platform) setPlatform(h.platform as any);
                                 
                                 // Try to infer content type from recipe
                                 if (h.recipe) {
                                   if (['caption', 'hashtags', 'long-post'].includes(h.recipe)) {
                                     setContentType('text');
                                     setTextType(h.recipe as any);
                                   } else if (h.recipe === 'image' || h.recipe.includes('image')) {
                                     setContentType('image');
                                     if (!aspectRatio) setAspectRatio('1:1');
                                   } else if (h.recipe === 'video' || h.recipe.includes('video')) {
                                     setContentType('video');
                                     if (!videoType) setVideoType('short-video');
                                     if (!duration) setDuration('5s');
                                   }
                                 }
                                 
                                 // Auto-generate when history is clicked
                                 setTimeout(() => handleGenerate(), 100);
                               }} 
                               className="text-left px-4 py-3 border border-blue-100/50 bg-blue-50/10 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all duration-200 text-[14px] text-blue-700/80 group flex items-center justify-between shadow-sm" 
                             > 
                               <span className="flex-1 truncate">
                                 {h.prompt}
                               </span> 
                               <RefreshCw className="h-4 w-4 text-blue-300 group-hover:text-blue-500 transition-colors ml-3 flex-shrink-0" /> 
                             </button> 
                           ))} 
                         </div> 
                       </div>
                     )}
                   </div> 
                 )} 
               </CardContent> 
             </Card> 
           )} 
 
           {/* STEP 6 — Generate Content */} 
           {canShowStep6 && !loading && !output && ( 
             <div className="flex justify-center pt-2"> 
               <Button 
                 onClick={handleGenerate} 
                 className="bg-purple-600 hover:bg-purple-700 text-white px-12 py-6 rounded-full text-lg font-bold shadow-lg transform transition-transform hover:scale-105 active:scale-95" 
               > 
                 Generate Content 
               </Button> 
             </div> 
           )} 
         </div> 
 
         {/* RIGHT SIDE - Output Panel */} 
         <Card className="w-[400px] flex flex-col h-full sticky top-6"> 
           <CardHeader className="pb-3 border-b border-gray-100"> 
             <CardTitle className="text-base font-semibold">Output Panel</CardTitle> 
           </CardHeader> 
           <CardContent className="flex-1 flex flex-col p-4 overflow-hidden"> 
             {loading ? (
               <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4"> 
                 <div className="relative">
                   <div className="h-16 w-16 rounded-full border-4 border-purple-100 border-t-purple-600 animate-spin" />
                   <div className="absolute inset-0 flex items-center justify-center">
                     <Sparkles className="h-6 w-6 text-purple-600 animate-pulse" />
                   </div>
                 </div>
                 <div className="space-y-1">
                   <p className="text-base font-semibold text-gray-900">Generating your content...</p>
                   <p className="text-sm text-gray-500">Our AI is working its magic ✨</p>
                 </div>
                 {contentType === 'video' && (
                   <div className="w-full max-w-[200px] bg-gray-100 rounded-full h-1.5 overflow-hidden">
                     <div className="bg-purple-600 h-full animate-shimmer" style={{ width: '100%', background: 'linear-gradient(90deg, #9333ea 0%, #d8b4fe 50%, #9333ea 100%)', backgroundSize: '200% 100%' }} />
                   </div>
                 )}
               </div> 
             ) : !output ? ( 
               <div className="flex-1 flex flex-col items-center justify-center text-gray-400 space-y-2 text-center"> 
                 <div className="text-4xl">✨</div> 
                 <p className="text-sm">Generated content will appear here</p> 
               </div> 
             ) : ( 
               <div className="flex-1 flex flex-col min-h-0 space-y-4"> 
                 <div className="bg-gray-50 rounded-lg p-3 flex-1 overflow-y-auto min-h-0"> 
                   {contentType === 'image' && (output.startsWith('data:image') || output.startsWith('http')) ? ( 
                     <img src={output} alt="Generated" className="w-full rounded" /> 
                   ) : contentType === 'video' && (videoType === 'short-video') && (output.startsWith('data:video') || output.startsWith('http') || output.includes('/temp/')) ? ( 
                     <video 
                       src={output} 
                       controls 
                       className="w-full rounded" 
                     /> 
                   ) : ( 
                     <pre className="whitespace-pre-wrap text-xs text-gray-800">{output}</pre> 
                   )} 
                 </div> 
 
                 <div className="grid grid-cols-1 gap-2 shrink-0"> 
                   <Button 
                     variant="outline" 
                     onClick={handleCopy} 
                     className="w-full justify-start text-xs h-9" 
                   > 
                     <Copy className="mr-2 h-3.5 w-3.5" /> 
                     Copy 
                   </Button> 
                   <Button 
                     variant="outline" 
                     onClick={handleRegenerate} 
                     disabled={loading} 
                     className="w-full justify-start text-xs h-9" 
                   > 
                     <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> 
                     Regenerate 
                   </Button> 
                   <Button 
                     onClick={handleSave} 
                     className="w-full justify-start text-xs h-9 bg-purple-600 hover:bg-purple-700" 
                   > 
                     <Save className="mr-2 h-3.5 w-3.5" /> 
                     Save to Library 
                   </Button> 
                 </div> 
               </div> 
             )} 
           </CardContent> 
         </Card> 
       </div> 
     </DashboardLayout> 
   ); 
 } 
