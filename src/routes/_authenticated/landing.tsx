import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import * as Icons from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { compressImage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/landing")({
  head: () => ({ meta: [{ title: "Landing Page Customizer · Tank by Tapan" }] }),
  component: LandingCustomizerPage,
});

function LandingCustomizerPage() {
  const me = useCurrentUser();
  
  if (me.loading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  if (!me.isAdmin) {
    return (
      <div className="py-10 text-center text-sm text-red-500 font-semibold">
        Access Denied: Only Admins can customize the landing page.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Landing Page Settings</h1>
        <p className="text-sm text-muted-foreground font-medium">Manage the sliding banners and photo gallery on your homepage.</p>
      </header>
      <div className="rounded-2xl border border-border bg-card p-6">
        <LandingTab />
      </div>
    </div>
  );
}

interface Banner {
  image: string;
  title: string;
  description: string;
  link: string;
}

function LandingTab() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBanners, setSavingBanners] = useState(false);
  const [savingPhotos, setSavingPhotos] = useState(false);
  
  // Banner upload form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newLink, setNewLink] = useState("/auth");
  const [newImgFile, setNewImgFile] = useState<File | null>(null);
  const [newImgPreview, setNewImgPreview] = useState("");
  
  // Gallery upload state
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // Edit Banner state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editLink, setEditLink] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      const [{ data: bannerRow }, { data: photoRow }] = await Promise.all([
        supabase.from("system_settings").select("value").eq("key", "landing_banners").maybeSingle(),
        supabase.from("system_settings").select("value").eq("key", "gym_photos").maybeSingle(),
      ]);

      if (bannerRow?.value) {
        setBanners(bannerRow.value as any as Banner[]);
      }
      if (photoRow?.value) {
        setPhotos(photoRow.value as any as string[]);
      }
    } catch (e: any) {
      toast.error("Failed to load landing settings: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAddBanner(e: React.FormEvent) {
    e.preventDefault();
    if (!newImgFile) {
      toast.error("Please select a banner image");
      return;
    }
    
    try {
      setUploadingBanner(true);
      
      // Compress image client-side to maximum width 1600px at 80% quality
      const optimizedFile = await compressImage(newImgFile, 1600, 0.8);
      
      const fileExt = optimizedFile.name.split(".").pop();
      const filePath = `banners/${Math.random()}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("photos").upload(filePath, optimizedFile);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(filePath);

      const updated = [
        ...banners,
        {
          image: publicUrl,
          title: newTitle,
          description: newDesc,
          link: newLink,
        }
      ];

      setSavingBanners(true);
      const { error: dbError } = await supabase
        .from("system_settings")
        .upsert({
          key: "landing_banners",
          value: updated as any,
          updated_at: new Date().toISOString(),
        });
      if (dbError) throw dbError;

      setBanners(updated);
      setNewTitle("");
      setNewDesc("");
      setNewLink("/auth");
      setNewImgFile(null);
      setNewImgPreview("");
      toast.success("Banner added successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to add banner");
    } finally {
      setUploadingBanner(false);
      setSavingBanners(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editingIndex === null) return;
    
    try {
      const updated = [...banners];
      updated[editingIndex] = {
        ...updated[editingIndex],
        title: editTitle.trim(),
        description: editDesc.trim(),
        link: editLink.trim(),
      };

      setSavingBanners(true);
      const { error: dbError } = await supabase
        .from("system_settings")
        .upsert({
          key: "landing_banners",
          value: updated as any,
          updated_at: new Date().toISOString(),
        });
      if (dbError) throw dbError;

      setBanners(updated);
      setEditDialogOpen(false);
      setEditingIndex(null);
      toast.success("Slide updated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update slide");
    } finally {
      setSavingBanners(false);
    }
  }

  async function handleDeleteBanner(index: number) {
    try {
      const updated = banners.filter((_, i) => i !== index);
      setSavingBanners(true);
      const { error } = await supabase
        .from("system_settings")
        .upsert({
          key: "landing_banners",
          value: updated as any,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      setBanners(updated);
      toast.success("Banner removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete banner");
    } finally {
      setSavingBanners(false);
    }
  }

  async function moveBanner(index: number, direction: "up" | "down") {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= banners.length) return;
    
    const updated = [...banners];
    const temp = updated[index];
    updated[index] = updated[nextIndex];
    updated[nextIndex] = temp;

    try {
      setSavingBanners(true);
      const { error } = await supabase
        .from("system_settings")
        .upsert({
          key: "landing_banners",
          value: updated as any,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      setBanners(updated);
    } catch (err: any) {
      toast.error(err.message || "Failed to reorder banners");
    } finally {
      setSavingBanners(false);
    }
  }

  async function handleAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (photos.length >= 4) {
      toast.error("You can upload a maximum of 4 photos for the gym gallery.");
      return;
    }

    try {
      setUploadingPhoto(true);
      
      // Compress image client-side to maximum width 800px at 75% quality
      const optimizedFile = await compressImage(file, 800, 0.75);
      
      const fileExt = optimizedFile.name.split(".").pop();
      const filePath = `gallery/${Math.random()}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("photos").upload(filePath, optimizedFile);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(filePath);

      const updated = [...photos, publicUrl];

      setSavingPhotos(true);
      const { error: dbError } = await supabase
        .from("system_settings")
        .upsert({
          key: "gym_photos",
          value: updated as any,
          updated_at: new Date().toISOString(),
        });
      if (dbError) throw dbError;

      setPhotos(updated);
      toast.success("Gym photo added successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to add photo");
    } finally {
      setUploadingPhoto(false);
      setSavingPhotos(false);
    }
  }

  async function handleDeletePhoto(index: number) {
    try {
      const updated = photos.filter((_, i) => i !== index);
      setSavingPhotos(true);
      const { error } = await supabase
        .from("system_settings")
        .upsert({
          key: "gym_photos",
          value: updated as any,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      setPhotos(updated);
      toast.success("Gym photo removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete photo");
    } finally {
      setSavingPhotos(false);
    }
  }

  if (loading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading landing settings...</div>;
  }

  return (
    <div className="space-y-10" suppressHydrationWarning>
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold">Hero Sliding Banners</h2>
          <p className="mt-1 text-sm text-muted-foreground font-medium">
            Manage full-width sliding banners for the homepage hero. Reorder or remove slides.
          </p>
        </div>

        <div className="space-y-3">
          {banners.length === 0 ? (
            <p className="text-xs text-slate-400">No slide banners found. Add one below.</p>
          ) : (
            banners.map((banner, index) => (
              <div key={index} className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center">
                <img
                  src={banner.image}
                  alt={banner.title}
                  className="h-16 w-32 rounded-lg object-cover bg-muted shrink-0"
                />
                <div className="flex-1 space-y-1">
                  <div className="text-sm font-bold">{banner.title || "(Untitled)"}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{banner.description || "(No description)"}</div>
                  <div className="text-[10px] text-primary font-semibold">{banner.link}</div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => moveBanner(index, "up")}
                    disabled={index === 0 || savingBanners}
                  >
                    <Icons.ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => moveBanner(index, "down")}
                    disabled={index === banners.length - 1 || savingBanners}
                  >
                    <Icons.ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setEditingIndex(index);
                      setEditTitle(banner.title);
                      setEditDesc(banner.description);
                      setEditLink(banner.link);
                      setEditDialogOpen(true);
                    }}
                    disabled={savingBanners}
                    title="Edit Slide Text/Link"
                  >
                    <Icons.Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDeleteBanner(index)}
                    disabled={savingBanners}
                  >
                    <Icons.Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddBanner} className="rounded-xl border border-border bg-card/40 p-4 space-y-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-bold">Add New Slide</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              💡 <strong>Tip:</strong> If your banner image already has text/buttons designed into the graphic itself, leave <strong>Slide Title</strong> and <strong>Slide Description</strong> empty. The image will be displayed cleanly and the entire slide will be clickable.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="banner-title">Slide Title</Label>
              <Input
                id="banner-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Drip Sweat, Track Growth"
              />
            </div>
            <div>
              <Label htmlFor="banner-link">Action Link</Label>
              <Input
                id="banner-link"
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                placeholder="/auth"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="banner-desc">Slide Description</Label>
            <Input
              id="banner-desc"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Brief subtitle text showing on the slide"
            />
          </div>

          <div>
            <Label>Slide Image File</Label>
            <div className="flex items-center gap-3 mt-1.5">
              <label className="flex h-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-muted/50 px-4 text-xs font-semibold hover:bg-muted">
                Choose Image File
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setNewImgFile(f);
                      setNewImgPreview(URL.createObjectURL(f));
                    }
                  }}
                  className="hidden"
                />
              </label>
              <span className="text-xs text-muted-foreground truncate">
                {newImgFile ? newImgFile.name : "No file chosen"}
              </span>
            </div>
            {newImgPreview && (
              <img
                src={newImgPreview}
                alt="Preview"
                className="mt-3 h-20 w-40 rounded-lg object-cover bg-muted border border-border"
              />
            )}
          </div>

          <Button
            type="submit"
            disabled={uploadingBanner || savingBanners || !newImgFile}
            className="gradient-primary text-primary-foreground"
          >
            {uploadingBanner ? "Adding Slide..." : "Add Banner Slide"}
          </Button>
        </form>
      </div>

      <div className="border-t border-border pt-8 space-y-6">
        <div>
          <h2 className="text-base font-semibold">Gym Photo Gallery ("Our Gym")</h2>
          <p className="mt-1 text-sm text-muted-foreground font-medium">
            Manage up to 4 photos displaying the gym facilities on the landing page.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {photos.map((photo, index) => (
            <div key={index} className="relative group aspect-square rounded-xl overflow-hidden bg-muted border border-border">
              <img
                src={photo}
                alt={`Gym Facility ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleDeletePhoto(index)}
                disabled={savingPhotos}
                className="absolute top-2 right-2 rounded-lg bg-black/60 p-1.5 text-white hover:bg-red-600 transition"
              >
                <Icons.Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {photos.length < 4 && (
            <label className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-border bg-muted/20 hover:bg-muted/50 cursor-pointer transition">
              <Icons.Plus className="h-8 w-8 text-muted-foreground" />
              <span className="mt-1 text-xs text-muted-foreground font-semibold">Upload Photo</span>
              <span className="text-[10px] text-slate-400 mt-0.5">({photos.length}/4)</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAddPhoto}
                disabled={uploadingPhoto || savingPhotos}
                className="hidden"
              />
            </label>
          )}
        </div>

        {photos.length >= 4 && (
          <p className="text-xs text-amber-500 font-medium">
            ⚠️ You have reached the maximum limit of 4 photos. Remove an existing photo to upload a new one.
          </p>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Banner Slide</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
            <div>
              <Label htmlFor="edit-title">Slide Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Leave blank to show image only"
              />
            </div>
            <div>
              <Label htmlFor="edit-desc">Slide Description</Label>
              <Input
                id="edit-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Leave blank to show image only"
              />
            </div>
            <div>
              <Label htmlFor="edit-link">Action Link</Label>
              <Input
                id="edit-link"
                value={editLink}
                onChange={(e) => setEditLink(e.target.value)}
                placeholder="/auth"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="gradient-primary text-primary-foreground">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
