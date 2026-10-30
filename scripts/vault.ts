import { connectVault, disconnectVault, syncVault, vaultStatus } from '../src/server/vault';
async function main() {
    const args = process.argv.slice(2), command = args[0];
    const option = (name: string) => { const at = args.indexOf(name); return at >= 0 ? (args[at + 1] || '').split(',').filter(Boolean) : undefined; };
    if (command === 'connect') {
        if (!args[1])
            throw new Error('Usage: npm run vault -- connect "C:\\path\\to\\vault" --include Notes,Projects --exclude Private');
        await connectVault(args[1], option('--include') || [], option('--exclude') || ['Private']);
        console.log('Read-only vault connection created.');
        console.log(await syncVault());
    }
    else if (command === 'sync')
        console.log(await syncVault());
    else if (command === 'disconnect') {
        disconnectVault();
        console.log('Vault disconnected. Imported copies remain in the library.');
    }
    else if (command === 'status')
        console.log(vaultStatus());
    else
        throw new Error('Commands: connect <path>, sync, disconnect, status.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Vault command failed.'); process.exitCode = 1; });
