'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Copy, Download, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { contentApi, ContentItem } from '@/lib/api/content';
import { useSearchParams } from 'next/navigation';

type ContentType = 'text' | 'image' | 'video';
type Platform = 'instagram' | 'facebook' | 'linkedin';
type TextModel = 'llama' | 'gpt' | 'gemini';
type ImageModel = 'qwen' | 'gpt' | 'gemini';
type VideoModel = 'wan' | 'ltx' | 'veo3';
type TextType = 'caption' | 'hashtags' | 'long-post';
type AspectRatio = '1:1' | '4:5' | '9:16';
type VideoType = 'short-video' | 'reel-script' | 'script-only';
type Duration = '5s' | '10s' | '15s';
type ImageStyle =
  | 'realistic'
  | 'cartoon'
  | 'cinematic'
  | 'minimalist'
  | 'digital-art'
  | '3d-render'
  | 'watercolor';

type ImageHistoryItem = {
  id: number;
  mode: 'generate' | 'edit';
  prompt: string;
  style: string | null;
  images: string[];
  createdAt: number;
};

const IMAGE_STYLE_OPTIONS: Array<{ label: string; value: ImageStyle }> = [
  { label: 'Realistic', value: 'realistic' },
  { label: 'Cartoon', value: 'cartoon' },
  { label: 'Cinematic', value: 'cinematic' },
  { label: 'Minimalist', value: 'minimalist' },
  { label: 'Digital Art', value: 'digital-art' },
  { label: '3D Render', value: '3d-render' },
  { label: 'Watercolor', value: 'watercolor' },
];

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

export default function CreateContentPage() {
  const searchParams = useSearchParams();

  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [textModel, setTextModel] = useState<TextModel>('llama');
  const [imageModel, setImageModel] = useState<ImageModel>('qwen');
  const [videoModel, setVideoModel] = useState<VideoModel>('wan');

  const [textType, setTextType] = useState<TextType | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio | null>(null);
  const [textOverlay, setTextOverlay] = useState<boolean | null>(null);
  const [overlayText, setOverlayText] = useState('');
  const [videoType, setVideoType] = useState<VideoType | null>(null);
  const [duration, setDuration] = useState<Duration | null>(null);

  const [imageStyle, setImageStyle] = useState<ImageStyle | null>(null);
  const [variations, setVariations] = useState<number>(1);
  const [imageOutputs, setImageOutputs] = useState<string[]>([]);
  const [imageHistory, setImageHistory] = useState<ImageHistoryItem[]>([]);
  const [sourceImageForEdit, setSourceImageForEdit] = useState<string | null>(null);

  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [loadedItem, setLoadedItem] = useState<ContentItem | null>(null);

  const cleanPromptInput = (value: string): string => value.replace(/\s+/g, ' ').trim();

  const extractErrorMessage = (err: any, fallback: string) => {
    return err?.response?.data?.message || err?.response?.data?.error || err?.message || fallback;
  };

  const appendHistory = (
    mode: 'generate' | 'edit',
    usedPrompt: string,
    images: string[],
    style: string | null,
  ) => {
    setImageHistory((prev) =>
      [
        ...prev,
        {
          id: Date.now() + Math.floor(Math.random() * 1000),
          mode,
          prompt: usedPrompt,
          style,
          images,
          createdAt: Date.now(),
        },
      ].slice(-10),
    );
  };

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;
    const contentId = id;

    async function loadExistingContent() {
      try {
        const response = await contentApi.getContentById(contentId);
        const item = response.data;

        setLoadedItem(item);
        setIsEditing(true);

        let detectedType: ContentType | null = null;
        if (item.type === 'text' || item.generatedText) detectedType = 'text';
        else if (item.type === 'image' || item.generatedImage) detectedType = 'image';
        else if (item.type === 'video' || item.generatedVideo) detectedType = 'video';

        if (detectedType) {
          setContentType(detectedType);
          if (detectedType === 'text') setTextType('caption');
        }

        if (item.platform) {
          const lower = item.platform.toLowerCase();
          if (['instagram', 'facebook', 'linkedin'].includes(lower)) {
            setPlatform(lower as Platform);
          }
        }

        if (item.metadata?.style) {
          setImageStyle(item.metadata.style as ImageStyle);
        }

        if (item.metadata?.variations && Number.isInteger(item.metadata.variations)) {
          setVariations(item.metadata.variations);
        }

        setPrompt(item.prompt || '');

        if (item.generatedText) {
          setOutput(item.generatedText);
        } else if (item.generatedImage) {
          setOutput(item.generatedImage);
          setImageOutputs([item.generatedImage]);
          setSourceImageForEdit(item.generatedImage);
          setImageHistory([
            {
              id: Date.now(),
              mode: 'generate',
              prompt: item.prompt || '',
              style: item.metadata?.style || null,
              images: [item.generatedImage],
              createdAt: Date.now(),
            },
          ]);
        } else if (item.generatedVideo) {
          setOutput(item.generatedVideo);
        }
      } catch (err: any) {
        console.error('Failed to load content for editing:', err);
        toast.error(extractErrorMessage(err, 'Failed to load content'));
      }
    }

    loadExistingContent();
  }, [searchParams]);

  const canShowStep2 = !!contentType;
  const canShowStep3 = !!contentType && !!platform;
  const canShowStep4 = !!contentType && !!platform && !!(
    contentType === 'text'
      ? textType
      : contentType === 'image'
      ? aspectRatio
      : contentType === 'video'
      ? videoType && duration
      : null
  );
  const canShowStep5 = canShowStep4;
  const canShowStep6 = canShowStep4 && prompt.trim().length > 0;

  const getSuggestions = () => {
    if (contentType === 'text') return TEXT_SUGGESTIONS;
    if (contentType === 'image') return IMAGE_SUGGESTIONS;
    if (contentType === 'video') return VIDEO_SUGGESTIONS;
    return [];
  };

  const handleSuggestionClick = (suggestion: string) => {
    setPrompt(suggestion);
  };

  async function handleGenerate() {
    if (!contentType || !platform || !prompt.trim()) {
      toast.error('Please complete all required steps.');
      return;
    }

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

    const cleanedPrompt = cleanPromptInput(prompt);
    if (cleanedPrompt.length < 5) {
      toast.error('Prompt must be at least 5 characters.');
      return;
    }

    setLoading(true);

    if (contentType !== 'image') {
      setOutput(null);
    }

    try {
      if (contentType === 'image') {
        const imagePrompt =
          textOverlay && overlayText.trim()
            ? `${cleanedPrompt}\n\nOverlay text: "${overlayText.trim()}".`
            : `${cleanedPrompt}`;

        const response = await contentApi.generateImage({
          prompt: imagePrompt,
          model: imageModel,
          style: imageStyle || undefined,
          variations,
          aspectRatio: aspectRatio || undefined,
        });

        const images = response.data.images || [];
        if (!response.data.success || images.length === 0) {
          throw new Error('Image generation returned no images.');
        }

        setPrompt(cleanedPrompt);
        setImageOutputs(images);
        setOutput(images[0]);
        setSourceImageForEdit(images[0]);
        appendHistory('generate', imagePrompt, images, response.data.meta?.style || null);
        toast.success(`Generated ${images.length} image${images.length > 1 ? 's' : ''}.`);
        return;
      }

      const model =
        contentType === 'text'
          ? textModel
          : videoModel;

      const response = await contentApi.generateContent({
        type: contentType,
        platform,
        model,
        prompt: cleanedPrompt,
        textType: contentType === 'text' ? textType : undefined,
        videoType: contentType === 'video' ? videoType : undefined,
        duration: contentType === 'video' ? duration : undefined,
      });

      setPrompt(cleanedPrompt);
      setOutput(
        response.data.output ||
          response.data.generatedText ||
          response.data.generatedImage ||
          response.data.generatedVideo ||
          'Content generated successfully!',
      );
      toast.success('Content generated!');
    } catch (err: any) {
      toast.error(extractErrorMessage(err, 'Something went wrong'));
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!output) return;
    navigator.clipboard.writeText(output);
    toast.success('Copied to clipboard!');
  }

  async function handleRegenerate() {
    if (loading) {
      return;
    }

    if (contentType !== 'image') {
      handleGenerate();
      return;
    }

    if (!prompt.trim()) {
      toast.error('Prompt is required.');
      return;
    }

    const cleanedPrompt = cleanPromptInput(prompt);
    if (cleanedPrompt.length < 5) {
      toast.error('Prompt must be at least 5 characters.');
      return;
    }

    setLoading(true);

    try {
      const previousImage =
        output ||
        imageOutputs[0] ||
        sourceImageForEdit ||
        loadedItem?.generatedImage ||
        loadedItem?.metadata?.allImages?.[0] ||
        undefined;
      const previousPrompt = loadedItem?.prompt || imageHistory[imageHistory.length - 1]?.prompt || cleanedPrompt;
      const imagePrompt =
        textOverlay && overlayText.trim()
          ? `${cleanedPrompt}\n\nOverlay text: "${overlayText.trim()}".`
          : `${cleanedPrompt}`;

      const response = await contentApi.editImage({
        prompt: imagePrompt,
        model: imageModel,
        style: imageStyle || undefined,
        variations,
        aspectRatio: aspectRatio || undefined,
        previousPrompt,
        previousImage,
        sourceContentId: loadedItem?.sourceContentId || loadedItem?.id,
        persistVersion: false,
      });

      const images = response.data.images || [];
      if (!response.data.success || images.length === 0) {
        throw new Error('Image regeneration returned no images.');
      }

      const nextPrimary = images.find((img) => img !== previousImage) || images[0];

      setPrompt(cleanedPrompt);
      setImageOutputs(images);
      setOutput(nextPrimary);
      setSourceImageForEdit(previousImage || null);
      appendHistory('edit', imagePrompt, images, response.data.meta?.style || null);

      const duplicateDetected = Boolean(response.data?.meta?.duplicateDetected);
      const retriesUsed = Number(response.data?.meta?.retriesUsed || 0);

      if (nextPrimary === previousImage || duplicateDetected) {
        toast.success('Regenerated. Result may be similar; try another style or prompt tweak.');
      } else if (retriesUsed > 0) {
        toast.success(`Regenerated after ${retriesUsed + 1} attempt${retriesUsed + 1 > 1 ? 's' : ''}.`);
      } else {
        toast.success(`Regenerated ${images.length} image${images.length > 1 ? 's' : ''}.`);
      }
    } catch (err: any) {
      const message = extractErrorMessage(err, 'Failed to regenerate image');
      if (message.toLowerCase().includes('unable to generate a different image')) {
        toast.error('Unable to generate a different image, please modify prompt.');
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }

  const getImageExtension = (mimeType: string, imageUrl: string): 'png' | 'jpeg' | 'webp' | 'gif' => {
    const normalizedType = mimeType.toLowerCase();
    const normalizedUrl = imageUrl.toLowerCase();

    if (normalizedType.includes('jpeg') || normalizedType.includes('jpg')) return 'jpeg';
    if (normalizedType.includes('webp')) return 'webp';
    if (normalizedType.includes('gif')) return 'gif';

    if (normalizedUrl.includes('.jpg') || normalizedUrl.includes('.jpeg')) return 'jpeg';
    if (normalizedUrl.includes('.webp')) return 'webp';
    if (normalizedUrl.includes('.gif')) return 'gif';

    return 'png';
  };

  async function handleDownloadImage() {
    if (contentType !== 'image' || !output) {
      toast.error('No image available to download.');
      return;
    }

    try {
      let blob: Blob;

      if (output.startsWith('data:')) {
        const response = await fetch(output);
        if (!response.ok) {
          throw new Error(`Download failed with status ${response.status}`);
        }
        blob = await response.blob();
      } else {
        const response = await contentApi.downloadImage(output);
        blob = response.data;
      }

      const extension = getImageExtension(blob.type || '', output);
      const fileName = `generated-image-${Date.now()}.${extension}`;
      const objectUrl = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.success('Downloaded successfully');
    } catch (err: any) {
      toast.error(extractErrorMessage(err, 'Failed to download image.'));
    }
  }

  async function handleSave() {
    if (isSaving) {
      return;
    }

    if (!contentType || !platform) {
      toast.error('Content type and platform are required before saving.');
      return;
    }

    if (!output) {
      toast.error('No content to save.');
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        type: contentType,
        platform,
        prompt: cleanPromptInput(prompt),
        generatedText: contentType === 'text' ? output : undefined,
        generatedImage: contentType === 'image' ? output || imageOutputs[0] || undefined : undefined,
        generatedVideo: contentType === 'video' ? output : undefined,
        status: 'draft',
        metadata:
          contentType === 'image'
            ? {
                style: imageStyle,
                variations,
                allImages: imageOutputs,
                history: imageHistory,
                sourceImageForEdit,
              }
            : undefined,
      };

      if (isEditing && loadedItem?.id) {
        const response = await contentApi.updateContent(loadedItem.id, {
          prompt: payload.prompt,
          generatedText: payload.generatedText,
          generatedImage: payload.generatedImage,
          generatedVideo: payload.generatedVideo,
          platform: payload.platform,
          status: payload.status,
          brandId: loadedItem.brandId,
          metadata: payload.metadata,
          createVersion: true,
          sourceContentId: loadedItem.sourceContentId || loadedItem.id,
        });

        setLoadedItem(response.data);
        toast.success('Edited version saved!');
        return;
      }

      await contentApi.saveContent(payload);
      toast.success('Saved to library!');
    } catch (err: any) {
      toast.error(extractErrorMessage(err, 'Failed to save content'));
    } finally {
      setIsSaving(false);
    }
  }

  const handleContentTypeChange = (type: ContentType) => {
    setContentType(type);
    setPlatform(null);
    setTextType(null);
    setAspectRatio(null);
    setTextOverlay(null);
    setOverlayText('');
    setVideoType(null);
    setDuration(null);
    setImageStyle(null);
    setVariations(1);
    setImageOutputs([]);
    setImageHistory([]);
    setSourceImageForEdit(null);
    setPrompt('');
    setOutput(null);
  };

  const selectImageOutput = (imageUrl: string) => {
    setOutput(imageUrl);
  };

  const imagePreview = contentType === 'image' && imageOutputs.length > 0;

  return (
    <DashboardLayout>
      <div className="flex gap-4 h-full">
        <div className="flex-1 space-y-3">
          <h1 className="text-xl font-bold">{isEditing ? 'Edit Content' : 'Create Content'}</h1>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Content Type</CardTitle>
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
                    <div className="text-xl">TXT</div>
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
                    <div className="text-xl">IMG</div>
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
                    <div className="text-xl">VID</div>
                    <div className="text-xs font-semibold text-gray-900">Video</div>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {canShowStep2 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Platform</CardTitle>
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

          {canShowStep3 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  {contentType === 'text' && 'Text Type'}
                  {contentType === 'image' && 'Image Settings'}
                  {contentType === 'video' && 'Video Type'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contentType === 'text' && (
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
                )}

                {contentType === 'image' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1.5 block">Aspect Ratio</label>
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

                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1.5 block">Style (Optional)</label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setImageStyle(null)}
                          className={`px-3 py-1.5 border rounded-full text-xs transition-all ${
                            imageStyle === null
                              ? 'border-purple-500 bg-purple-50 text-gray-900'
                              : 'border-gray-200 text-gray-700 hover:border-purple-400 hover:bg-purple-50'
                          }`}
                        >
                          None
                        </button>
                        {IMAGE_STYLE_OPTIONS.map((styleItem) => (
                          <button
                            key={styleItem.value}
                            onClick={() => setImageStyle(styleItem.value)}
                            className={`px-3 py-1.5 border rounded-full text-xs transition-all ${
                              imageStyle === styleItem.value
                                ? 'border-purple-500 bg-purple-50 text-gray-900'
                                : 'border-gray-200 text-gray-700 hover:border-purple-400 hover:bg-purple-50'
                            }`}
                          >
                            {styleItem.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1.5 block">Variations</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map((count) => (
                          <button
                            key={count}
                            onClick={() => setVariations(count)}
                            className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                              variations === count
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50'
                            }`}
                          >
                            <div className="text-xs font-semibold text-gray-900">{count}</div>
                          </button>
                        ))}
                      </div>
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
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {canShowStep4 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">AI Model</CardTitle>
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
                    <button disabled className="flex-1 p-2 border-2 rounded-full bg-gray-100 opacity-50 cursor-not-allowed">
                      <div className="text-xs font-semibold text-gray-500">GPT</div>
                    </button>
                    <button disabled className="flex-1 p-2 border-2 rounded-full bg-gray-100 opacity-50 cursor-not-allowed">
                      <div className="text-xs font-semibold text-gray-500">Gemini</div>
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
                      onClick={() => setImageModel('gpt')}
                      className={`flex-1 p-2 border-2 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                        imageModel === 'gpt'
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-400 hover:bg-purple-50'
                      }`}
                    >
                      <div className="text-xs font-semibold text-gray-900">GPT</div>
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
                    <button disabled className="flex-1 p-2 border-2 rounded-full bg-gray-100 opacity-50 cursor-not-allowed">
                      <div className="text-xs font-semibold text-gray-500">LTX</div>
                    </button>
                    <button disabled className="flex-1 p-2 border-2 rounded-full bg-gray-100 opacity-50 cursor-not-allowed">
                      <div className="text-xs font-semibold text-gray-500">VEO3</div>
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {canShowStep5 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Prompt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter your prompt here..."
                  className="min-h-[80px] text-sm"
                />

                {contentType === 'image' && (
                  <div className="space-y-1.5 pt-1 border-t border-gray-100">
                    <label className="text-xs font-medium text-gray-700">Overlay Text (optional)</label>
                    <Input
                      value={overlayText}
                      onChange={(e) => {
                        const value = e.target.value;
                        setOverlayText(value);
                        setTextOverlay(value.trim().length > 0 ? true : null);
                      }}
                      placeholder="Enter overlay text (will be placed on top of the image)"
                      className="h-8 text-sm"
                    />
                  </div>
                )}

                {getSuggestions().length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">Suggestions</label>
                    <div className="flex flex-col gap-1.5">
                      {getSuggestions().map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="text-left p-2 border border-gray-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all duration-200 text-xs text-gray-700"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {canShowStep6 && (
            <Card>
              <CardContent className="pt-4">
                <Button onClick={handleGenerate} disabled={loading} className="w-full" size="default">
                  {loading
                    ? contentType === 'image'
                      ? 'Generating Images...'
                      : 'Generating...'
                    : contentType === 'image'
                    ? 'Generate Images'
                    : 'Generate Content'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="w-80 flex-shrink-0">
          <Card className="sticky top-6 h-120 flex flex-col">
            <CardHeader className="pb-3 flex-shrink-0">
              <CardTitle className="text-base font-semibold">Output Panel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 flex-1 flex flex-col min-h-0">
              {loading && (
                <div className="text-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto mb-3"></div>
                  <p className="text-gray-500 text-xs">
                    {contentType === 'image' ? 'Generating images...' : 'Generating content...'}
                  </p>
                </div>
              )}

              {!loading && !output && !imagePreview && (
                <div className="text-center py-6">
                  <p className="text-gray-400 text-xs">Generated content will appear here</p>
                </div>
              )}

              {!loading && (output || imagePreview) && (
                <div className="space-y-3 flex-1 flex flex-col min-h-0">
                  <div className="bg-gray-50 rounded-lg p-3 flex-1 overflow-y-auto min-h-0 space-y-3">
                    {contentType === 'image' && imageOutputs.length > 0 ? (
                      <>
                        <img src={output || imageOutputs[0]} alt="Generated" className="w-full rounded border border-gray-200" />
                        {imageOutputs.length > 1 && (
                          <div>
                            <p className="text-[11px] text-gray-500 mb-1.5">Variations ({imageOutputs.length})</p>
                            <div className="grid grid-cols-2 gap-2">
                              {imageOutputs.map((img, index) => (
                                <button
                                  key={`${img}-${index}`}
                                  onClick={() => selectImageOutput(img)}
                                  className={`rounded border overflow-hidden ${(output || imageOutputs[0]) === img ? 'border-purple-500' : 'border-gray-200'}`}
                                >
                                  <img src={img} alt={`Variation ${index + 1}`} className="w-full h-20 object-cover" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {imageHistory.length > 1 && (
                          <div>
                            <p className="text-[11px] text-gray-500 mb-1.5">Recent history</p>
                            <div className="space-y-1.5">
                              {imageHistory.slice(-3).reverse().map((item) => (
                                <div key={item.id} className="text-[11px] border border-gray-200 rounded px-2 py-1.5 bg-white">
                                  <p className="font-medium text-gray-700">
                                    {item.mode === 'edit' ? 'Edited' : 'Generated'} - {new Date(item.createdAt).toLocaleTimeString()}
                                  </p>
                                  <p className="text-gray-500 truncate">
                                    {item.style ? `Style: ${item.style}` : 'Style: none'} | Images: {item.images.length}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : contentType === 'video' && output && (output.startsWith('data:video') || output.startsWith('http')) ? (
                      <video src={output} controls className="w-full rounded" />
                    ) : (
                      <pre className="whitespace-pre-wrap text-xs text-gray-800">{output}</pre>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <Button variant="outline" onClick={handleCopy} className="w-full h-8 text-xs" size="sm" disabled={!output}>
                      <Copy className="w-3 h-3 mr-1.5" />
                      {contentType === 'image' ? 'Copy Image URL' : 'Copy'}
                    </Button>
                    <Button variant="outline" onClick={handleRegenerate} className="w-full h-8 text-xs" size="sm" disabled={loading}>
                      <RefreshCw className="w-3 h-3 mr-1.5" />
                      Regenerate
                    </Button>
                    {contentType === 'image' && (
                      <Button variant="outline" onClick={handleDownloadImage} className="w-full h-8 text-xs" size="sm" disabled={!output}>
                        <Download className="w-3 h-3 mr-1.5" />
                        Download
                      </Button>
                    )}
                    <Button variant="outline" onClick={handleSave} className="w-full h-8 text-xs" size="sm" disabled={isSaving || loading}>
                      <Save className="w-3 h-3 mr-1.5" />
                      {isSaving ? 'Saving...' : 'Save to Library'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
