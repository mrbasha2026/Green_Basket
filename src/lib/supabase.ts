import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anonKey)

// يجلب كل الصفوف على دفعات بغض النظر عن حد الخادم الافتراضي (1000 صف)
export async function fetchAllPages<T>(
  fetcher: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  let start = 0
  while (true) {
    const { data, error } = await fetcher(start, start + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    start += PAGE
  }
  return all
}
