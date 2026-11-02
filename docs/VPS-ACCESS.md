# VPS access: SSH and GitHub

A first-time walkthrough for connecting to the Hostinger VPS from your laptop, and connecting the VPS to GitHub. SSH, keys, `sudo` and the other terms used here are defined in the [glossary](GLOSSARY.md).

> **`203.0.113.10` is a placeholder.** It's from a range reserved for documentation, so it never belongs to a real server. Wherever you see it, use your VPS's IP from **hPanel → VPS → Overview**.

**Where to run each command.** Each block is labelled:

- 💻 **laptop**: your own machine
- 🖥️ **VPS**: inside an SSH session on the server

You'll set up three SSH keys. Each one is used for a single purpose, so if one leaks you can revoke it without touching the others.

| Key | Lives on | Lets… | Into |
|---|---|---|---|
| `~/.ssh/id_ed25519` | 💻 laptop | **you** log in | the VPS, as `chirag` (has `sudo`) |
| `~/.ssh/ckauth_deploy` | 💻 laptop → GitHub secret | **GitHub Actions** deploy | the VPS, as `deploy` (Docker only) |
| `~/.ssh/github_ckauth` | 🖥️ VPS | **the VPS** read the repo | GitHub, one repo, read-only |

---

## Part 1: SSH from your laptop to the VPS

### 1.1 Create your SSH key

💻 laptop:

```bash
ls ~/.ssh/id_ed25519.pub
```

If that file already exists, you have a key, so skip to 1.2. Otherwise:

```bash
ssh-keygen -t ed25519 -C "chirag-laptop"
```

- **File location:** press Enter to accept `~/.ssh/id_ed25519`.
- **Passphrase:** choose one. If someone copies the key file, it's useless to them without it. `ssh-agent` remembers it, so you don't type it on every login.

This creates two files:

- `id_ed25519` is the **private** key. Never share or copy it anywhere.
- `id_ed25519.pub` is the **public** key. It's safe to paste anywhere.

### 1.2 Give the VPS your public key

💻 laptop: print the public key and copy the whole line.

```bash
cat ~/.ssh/id_ed25519.pub
# ssh-ed25519 AAAAC3Nz...long string... chirag-laptop
```

In **hPanel → VPS → Settings → SSH keys → Add SSH key**, paste it. If you're reinstalling the OS, choose **Ubuntu 24.04** and select this key during setup.

> **No SSH key option?** Set a root password in hPanel, then run `ssh-copy-id root@203.0.113.10` from your laptop and enter that password once.

### 1.3 First login as root

💻 laptop:

```bash
ssh root@203.0.113.10
```

The first time, SSH asks:

```
The authenticity of host '203.0.113.10' can't be established.
ED25519 key fingerprint is SHA256:xxxxxxxx.
Are you sure you want to continue connecting (yes/no)?
```

Type `yes`. SSH saves the server's fingerprint in `~/.ssh/known_hosts`, and warns you loudly if it ever changes (which would mean a different machine is answering at that IP). Your prompt now ends in `root@srv…:~#`, so you're on the VPS. Type `exit` to leave.

### 1.4 Run the setup script

💻 laptop, from the repo folder:

```bash
scp deploy/setup-vps.sh root@203.0.113.10:/root/
ssh -t root@203.0.113.10 bash /root/setup-vps.sh
```

`-t` gives the script a terminal so it can ask you a question. Partway through it asks for **a password for `chirag`**. That password is only for `sudo`; SSH logins use your key.

The script does the following:

- Installs Docker and git.
- Creates the users `chirag` (you, with `sudo`) and `deploy` (for GitHub Actions). `chirag` also joins the `deploy` group, so you can both work in `/opt/ckauth` and `/opt/edge`.
- Copies your laptop key to `chirag`.
- Turns on the firewall and automatic security updates.
- Turns off root logins and password logins.

### 1.5 Test before you close anything

**Keep the root terminal open.** In a **new** terminal:

💻 laptop:

```bash
ssh chirag@203.0.113.10
sudo whoami        # asks for the chirag password, prints: root
docker ps          # works without sudo; prints an empty table
id                 # the groups include sudo, docker and deploy
```

If all four work, you can close the root session. If `ssh chirag@…` fails, fix it from the still-open root session, or from **hPanel → VPS → Browser terminal**, which always works.

### 1.6 Add a shortcut

💻 laptop: open (or create) `~/.ssh/config`:

```bash
nano ~/.ssh/config
```

Add:

```
Host vps
    HostName 203.0.113.10
    User chirag
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    ServerAliveInterval 60
```

```bash
chmod 600 ~/.ssh/config
```

Now `ssh vps` logs you in, and `scp file.txt vps:~/` copies a file. Every command in the docs that uses `chirag@203.0.113.10` can use `vps` instead.

`ServerAliveInterval` keeps idle sessions from being dropped.

---

## Part 2: GitHub on the VPS

The deploy pipeline doesn't need this: GitHub Actions pushes images, and the server never builds code. It's for **you**, to clone repos, read files or run scripts on the server.

### 2.1 Choose a key type

| | Deploy key (**recommended**) | Account key |
|---|---|---|
| Added at | Repo → Settings → Deploy keys | Your GitHub profile → SSH keys |
| Can access | **This one repo** | **Every repo** on your account |
| Can push? | Only if you allow it | Yes |
| If the VPS is hacked | The attacker can read one repo | The attacker can change all your code |

Servers get hacked more often than laptops, so give the VPS a **read-only deploy key per repo**.

### 2.2 Create the key on the VPS

🖥️ VPS (`ssh vps`):

```bash
ssh-keygen -t ed25519 -C "vps-ckauth-readonly" -f ~/.ssh/github_ckauth -N ""
cat ~/.ssh/github_ckauth.pub
```

`-N ""` means no passphrase, so scripts can use the key without anyone typing a passphrase. That's acceptable here because the key can only *read* one repo.

### 2.3 Add it to the repo

On GitHub, open **chiragdev1/ckauth → Settings → Deploy keys → Add deploy key**:

- **Title:** `vps (read-only)`
- **Key:** paste the `.pub` line
- **Allow write access:** leave it **unchecked**

### 2.4 Point SSH at the key

GitHub accepts a given deploy key on only one repo. So that you can add more repos later, give each one a host alias.

🖥️ VPS:

```bash
nano ~/.ssh/config
```

```
Host github-ckauth
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_ckauth
    IdentitiesOnly yes
```

```bash
chmod 600 ~/.ssh/config
ssh -T git@github-ckauth
```

The first connection asks you to confirm GitHub's fingerprint. Before typing `yes`, check it matches GitHub's published ED25519 fingerprint:

```
SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
```

You can also check it at <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints>. If they match, type `yes`. You should see:

```
Hi chiragdev1/ckauth! You've successfully authenticated, but GitHub does not provide shell access.
```

### 2.5 Clone

🖥️ VPS:

```bash
git clone git@github-ckauth:chiragdev1/ckauth.git ~/Authentication
cd ~/Authentication && git pull     # later, to update
```

The repo was renamed from `Authentication` to `ckauth` on 23 Oct 2026. The folder keeps its old name, so existing paths still work. GitHub redirects the old URL, but point an existing clone at the new one: `git -C ~/Authentication remote set-url origin git@github-ckauth:chiragdev1/ckauth.git`.

Note the host is `github-ckauth`, the alias, not `github.com`.

**Another repo later:** create a new key (`-f ~/.ssh/github_<name>`), add it as that repo's deploy key, add a `Host github-<name>` block, and clone with `git@github-<name>:chiragdev1/<repo>.git`.

---

## Part 3: GitHub Actions → VPS

This is the key the CI/CD pipeline uses to deploy. It logs in as `deploy`, which can run Docker but has no `sudo`.

💻 laptop:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/ckauth_deploy -N "" -C "github-actions-deploy"
```

Copy the public key to the `deploy` user. You can't log in as `deploy` yet, so go through `chirag`. `-t` gives `sudo` a terminal to ask for your password. The key goes inside the command, not through a pipe, because a piped key would be read as the password:

```bash
ssh -t vps "echo '$(cat ~/.ssh/ckauth_deploy.pub)' | sudo tee -a /home/deploy/.ssh/authorized_keys > /dev/null"
ssh -i ~/.ssh/ckauth_deploy deploy@203.0.113.10 docker ps      # should print an empty table
```

Get the server's host key for GitHub:

```bash
ssh-keyscan -t ed25519 203.0.113.10
# 203.0.113.10 ssh-ed25519 AAAAC3Nz...
```

Check that this matches what your laptop already trusts. This command should print the same key:

```bash
ssh-keygen -F 203.0.113.10
```

Then, in **GitHub → Settings → Environments → production**, add these (full list in [DEPLOYMENT.md](DEPLOYMENT.md#step-7-connect-github-to-the-vps)):

| Secret | Value |
|---|---|
| `VPS_HOST` | `203.0.113.10` (your real IP) |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | output of `cat ~/.ssh/ckauth_deploy`, the **private** key, including the `BEGIN`/`END` lines |
| `VPS_KNOWN_HOSTS` | the `ssh-keyscan` line |

Once it's saved in GitHub, you can delete the private key from your laptop (`rm ~/.ssh/ckauth_deploy`). Only GitHub needs it. If it's ever lost, make a new one.

---

## Everyday commands

```bash
ssh vps                                   # log in
ssh vps 'docker ps'                       # run one command without staying logged in
scp ./file vps:~/                         # copy to the server
scp vps:~/file ./                         # copy from the server
```

## Revoking access

| Lost or leaked | Do this |
|---|---|
| Laptop | Use the hPanel browser terminal and remove the line from `/home/chirag/.ssh/authorized_keys` |
| The GitHub Actions key | Remove its line from `/home/deploy/.ssh/authorized_keys`, then make a new key (Part 3) |
| The VPS | Delete its deploy key on GitHub (repo → Settings → Deploy keys) |

## Troubleshooting

| Message | Meaning |
|---|---|
| `Permission denied (publickey)` | Wrong user, or the key isn't in that user's `authorized_keys`. Try `ssh -v vps` to see which key was offered. |
| `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!` | Expected **only** if you reinstalled the VPS: run `ssh-keygen -R 203.0.113.10` and reconnect. Otherwise stop and investigate. |
| `Connection timed out` | Wrong IP, the VPS is off, or the firewall is blocking SSH. Use the hPanel browser terminal. |
| `sudo: a password is required` | Type the `chirag` password from step 1.4, not your SSH key passphrase. |
