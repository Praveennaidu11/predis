'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useGenerationJob } from '@/hooks/useGenerationJob';
import type { GenerationRecipe, PromptHistory } from '@/lib/api/generation';
import { generationApi } from '@/lib/api/generation';
import { History, Sparkles, X } from 'lucide-react';

type Platform = 'instagram' | 'facebook' | 'linkedin';
type Duration = 5 | 10 | 15;

const POPULAR_SUGGESTIONS = [
  'Create a catchy Instagram caption about sustainable fashion',
  'Write engaging hashtags for a tech startup launch',
  'Draft a long-form LinkedIn post about remote work benefits',
  'Generate a caption for a food photography post',
  'Create hashtags for a fitness brand campaign',
  'Write a product launch post for a new organic coffee blend',
];

const HISTORY_KEY = 'predis_prompt_history';

export type GenerationPanelProps = {
  title?: string;
  defaultPlatform?: Platform;
  mode: 'merchant' | 'admin';
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/**
 * Shared generation UI.
 *
 * Why: management requires one reusable component across Merchant + Admin.
 * This panel talks only to `/api/generation/jobs` and uses the shared hook for polling.
 */
export default function GenerationPanel(props: GenerationPanelProps) {
  const { state, createAndPoll } = useGenerationJob();

  const [recipe, setRecipe] = useState<GenerationRecipe>('text_to_image');
  const [platform, setPlatform] = useState<Platform>(props.defaultPlatform || 'instagram');
  const [duration, setDuration] = useState<Duration>(5);
  const [prompt, setPrompt] = useState('');

  const [inputImage, setInputImage] = useState<string | null>(null);
  const [firstFrame, setFirstFrame] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<string | null>(null);

  const [history, setHistory] = useState<PromptHistory[]>([]);

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

  const busy = state.status === 'creating' || state.status === 'polling';

  const output = state.job?.output;
  const outputUrl: string | null = useMemo(() => {
    if (!output) return null;
    return output.imageUrl || output.videoUrl || null;
  }, [output]);

  const showInputImage = recipe === 'image_to_image';
  const showFrames = recipe === 'first_last_prompt_to_video' || recipe === 'first_last_to_video';
  const showDuration = recipe.includes('video');
  const needsPrompt = recipe !== 'first_last_to_video';

  const onGenerate = async (overridePrompt?: string) => {
    try {
      const activePrompt = overridePrompt || prompt;
      if (!recipe) return;
      if (needsPrompt && activePrompt.trim().length < 2) {
        toast.error('Please enter a prompt.');
        return;
      }
      if (showInputImage && !inputImage) {
        toast.error('Please select an input image.');
        return;
      }
      if (showFrames && (!firstFrame || !lastFrame)) {
        toast.error('Please select both first and last frames.');
        return;
      }

      await createAndPoll({
        recipe,
        prompt: activePrompt.trim() || undefined,
        provider: 'gemini',
        platform,
        duration: showDuration ? duration : undefined,
        input: {
          inputImage: inputImage || undefined,
          firstFrame: firstFrame || undefined,
          lastFrame: lastFrame || undefined,
        },
      });

      toast.info('Generation started. Polling…');
      // Refresh history after a short delay to allow the backend to save it
      setTimeout(fetchHistory, 2000);
    } catch (e: any) {
      toast.error('Generation request failed', {
        description: e?.response?.data?.message || e?.message,
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title || 'AI Generation'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Recipe</div>
            <Select value={recipe} onValueChange={(v) => setRecipe(v as GenerationRecipe)}>
              <SelectTrigger>
                <SelectValue placeholder="Select recipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text_to_image">Text → Image</SelectItem>
                <SelectItem value="image_to_image">Image → Image</SelectItem>
                <SelectItem value="text_to_video">Text → Video</SelectItem>
                <SelectItem value="first_last_prompt_to_video">First + Last + Prompt → Video</SelectItem>
                <SelectItem value="first_last_to_video">First + Last → Video</SelectItem>
                <SelectItem value="ugc_create">UGC Creation (Brief)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Platform</div>
            <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <SelectTrigger>
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {showDuration && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Duration</div>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v) as Duration)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5s</SelectItem>
                <SelectItem value="10">10s</SelectItem>
                <SelectItem value="15">15s</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {needsPrompt && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Prompt</div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want to generate…"
                className="min-h-[90px]"
              />
            </div>

            <div className="space-y-4">
              {/* Popular Suggestions Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-purple-500" />
                  Popular Suggestions
                </div>
                <div className="flex flex-col gap-2">
                  {POPULAR_SUGGESTIONS.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPrompt(suggestion)}
                      className="text-left px-3 py-2 text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg border border-border transition-colors flex items-center justify-between"
                    >
                      <span>{suggestion}</span>
                      <Sparkles className="w-3 h-3 text-purple-400" />
                    </button>
                  ))}
                </div>
              </div>

              {/* History Section */}
              {history.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <History className="w-3 h-3 text-blue-500" />
                      Recent Prompts
                    </div>
                    <button
                      onClick={clearHistory}
                      className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1"
                    >
                      <X className="w-2.5 h-2.5" />
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {history.map((h, idx) => (
                      <button
                        key={h.id || idx}
                        onClick={() => {
                          setPrompt(h.prompt);
                          onGenerate(h.prompt);
                        }}
                        className="text-left px-3 py-2 text-xs bg-blue-50/50 hover:bg-blue-100/50 text-blue-700 rounded-lg border border-blue-200/50 transition-colors flex items-center justify-between"
                      >
                        <span className="truncate flex-1">{h.prompt}</span>
                        <History className="w-3 h-3 text-blue-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {showInputImage && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Input image</div>
            <Input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const url = await fileToDataUrl(f);
                setInputImage(url);
              }}
            />
            {inputImage && <img src={inputImage} alt="Input" className="w-full max-w-sm rounded border" />}
          </div>
        )}

        {showFrames && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">First frame</div>
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const url = await fileToDataUrl(f);
                  setFirstFrame(url);
                }}
              />
              {firstFrame && <img src={firstFrame} alt="First frame" className="w-full rounded border" />}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Last frame</div>
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const url = await fileToDataUrl(f);
                  setLastFrame(url);
                }}
              />
              {lastFrame && <img src={lastFrame} alt="Last frame" className="w-full rounded border" />}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={onGenerate} disabled={busy}>
            {busy ? 'Generating…' : 'Generate'}
          </Button>
          {state.status === 'failed' && (
            <div className="text-sm text-red-600">{state.error}</div>
          )}
        </div>

        {state.job && (
          <div className="text-xs text-muted-foreground">
            Job: <span className="font-mono">{state.job.id}</span> • Status:{' '}
            <span className="font-medium">{state.job.status}</span>
          </div>
        )}

        {outputUrl && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Output</div>
            {outputUrl.includes('/temp/') || outputUrl.startsWith('http') ? (
              recipe.includes('video') ? (
                <video src={outputUrl} controls className="w-full rounded border" />
              ) : (
                <img src={outputUrl} alt="Generated output" className="w-full rounded border" />
              )
            ) : (
              <pre className="text-xs bg-muted p-3 rounded">{JSON.stringify(output, null, 2)}</pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

