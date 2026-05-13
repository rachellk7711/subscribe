import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yyflgbpezcebjqvfveon.supabase.co';
const supabaseKey = 'sb_publishable_Uw6K7JbWlEOvsVym_CeXHg_js8VISXi';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testAuth() {
  console.log("Trying to sign up...");
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: 'mytest123@gmail.com',
    password: 'password123',
  });
  
  if (signUpError) {
    console.log("SignUp Error:", signUpError.message);
  } else {
    console.log("SignUp Data:", signUpData);
  }

  console.log("\nTrying to log in...");
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: 'mytest123@gmail.com',
    password: 'password123',
  });

  if (loginError) {
    console.log("Login Error:", loginError.message);
  } else {
    console.log("Login Data:", !!loginData.session);
  }
}

testAuth();
