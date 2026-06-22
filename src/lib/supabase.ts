import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anonKey)

// يجلب كل الصفوف على دفعات بغض النظر عن حد الخادم الافتراضي (1000 صف)
// maxPages: حد أقصى للدفعات — يمنع loop لا نهاية في حالة خطأ (الافتراضي 100 = 100,000 صف)
export async function fetchAllPages<T>(
  fetcher: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  maxPages = 100
): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  for (let page = 0; page < maxPages; page++) {
    const start = page * PAGE
    const { data, error } = await fetcher(start, start + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
  }
  return all
}
