const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tulufkrdqsojgzbuvgtg.supabase.co';
const supabaseAnonKey = 'sb_publishable_xGHHjAG9Eo7Mg464Ibn85g_22uMKGFO';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSigns() {
  try {
    const { data, error } = await supabase
      .from('signs')
      .select('*')
      .limit(10);
    
    if (error) {
      console.error('Error fetching signs:', error);
      return;
    }
    
    console.log('Signs in Database:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Catch error:', err);
  }
}

checkSigns();
