
-- Create bar_images table
CREATE TABLE public.bar_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bar_id UUID REFERENCES public.bars(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes
CREATE INDEX bar_images_bar_id_idx ON public.bar_images(bar_id);
CREATE UNIQUE INDEX bar_images_bar_id_is_primary_idx ON public.bar_images(bar_id) WHERE is_primary = true;

-- Create storage bucket for bar images if it doesnt exist
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name)
  VALUES (bar-images, bar-images)
  ON CONFLICT DO NOTHING;
END $$;

-- Create policy to allow authenticated users to upload to their own bar folder
CREATE POLICY "Bar owners can upload images" 
  ON storage.objects FOR INSERT 
  TO authenticated
  USING (
    bucket_id = bar-images AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.bars WHERE owner_id = auth.uid()
    )
  );

-- Create policy to allow public to view images
CREATE POLICY "Anyone can view bar images" 
  ON storage.objects FOR SELECT 
  TO public
  USING (bucket_id = bar-images);

-- Create policy to allow bar owners to delete their images
CREATE POLICY "Bar owners can delete their images" 
  ON storage.objects FOR DELETE 
  TO authenticated
  USING (
    bucket_id = bar-images AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.bars WHERE owner_id = auth.uid()
    )
  );

