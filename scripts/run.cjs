const fs=require('node:fs');const path=require('node:path');const {spawnSync,fork}=require('node:child_process');
process.chdir(path.resolve(__dirname,'..'));
for(const file of ['.env','.env.local'])if(fs.existsSync(file))process.loadEnvFile(file);
if(process.argv.includes('--dev')||!fs.existsSync('dist/server/src/server/http.js')){const build=spawnSync(process.execPath,['scripts/build.cjs'],{stdio:'inherit'});if(build.status!==0)process.exit(build.status||1);}
const server=fork('dist/server/src/server/http.js',[],{stdio:'inherit'});const worker=fork('dist/server/scripts/worker.js',[],{stdio:'inherit'});let stopping=false;
function stop(){if(stopping)return;stopping=true;server.kill();worker.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);server.on('exit',code=>{stop();process.exitCode=code||0;});worker.on('exit',code=>{if(!stopping){console.error('Reminder worker stopped. Restart Memnivo to restore background processing.');stop();process.exitCode=code||1;}});
