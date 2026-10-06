import { useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import Avatar from "@/components/Avatar";
import CameraCapture from "@/components/CameraCapture";
import { Button } from "@/components/ui/button";
import { AVATAR_COLORS } from "@/lib/types";
import { cn } from "@/lib/utils";

// Read an image file and shrink it to a small square-ish avatar (max 400px) as a JPEG data URL.
async function fileToAvatar(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
  const max = 400;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export default function AvatarPicker({
  name,
  color,
  avatar,
  onChange,
  testid = "avatar-picker",
}: {
  name: string;
  color: string;
  avatar: string | null;
  onChange: (value: { color: string; avatar: string | null }) => void;
  testid?: string;
}) {
  const [camOpen, setCamOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4" data-testid={testid}>
      <div className="flex items-center gap-4">
        <Avatar name={name} color={color} avatar={avatar} size={64} testid={`${testid}-preview`} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid={`${testid}-take`}
            onClick={() => setCamOpen(true)}
          >
            <Camera className="size-4" />
            Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid={`${testid}-upload`}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
            Upload
          </Button>
          {avatar && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              data-testid={`${testid}-remove`}
              onClick={() => onChange({ color, avatar: null })}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-testid={`${testid}-file`}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            try {
              onChange({ color, avatar: await fileToAvatar(file) });
            } catch {
              toast.error("Sorry, that image couldn't be read. Try another photo.");
            }
          }
          e.target.value = "";
        }}
      />

      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Tile colour</p>
        <div className="flex flex-wrap gap-2" data-testid={`${testid}-colors`}>
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              data-testid={`${testid}-color-${c}`}
              onClick={() => onChange({ color: c, avatar })}
              style={{ backgroundColor: c }}
              aria-label={`Colour ${c}`}
              className={cn(
                "size-8 rounded-full outline-none transition-transform duration-150 hover:scale-110",
                color === c ? "ring-2 ring-gold ring-offset-2 ring-offset-charcoal" : "",
              )}
            />
          ))}
        </div>
      </div>

      <CameraCapture
        open={camOpen}
        title="Take your photo"
        testid={`${testid}-camera`}
        onClose={() => setCamOpen(false)}
        onCapture={(dataUrl) => onChange({ color, avatar: dataUrl })}
      />
    </div>
  );
}
