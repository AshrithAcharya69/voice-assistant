#!/usr/bin/env python3
"""
ELSA 4.0 - ULTRA ADVANCED AI BACKEND
Fixed: trailing period in app names, screen recording, added advanced features
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os, subprocess, platform, webbrowser, time, threading, re
import json, urllib.parse, base64, logging, traceback, requests as req
from datetime import datetime
from io import BytesIO

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins="*")
CURRENT_OS = platform.system()

# === READ KEYS ===
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GOOGLE_API_KEY    = os.getenv("GOOGLE_API_KEY", "")
ELEVEN_API_KEY    = os.getenv("ELEVEN_API_KEY", "")
FAL_KEY           = os.getenv("FAL_KEY", "")

def mask(k): return k[:12]+"..." if k and len(k)>12 else ("(not set)" if not k else k)

def clean_name(name):
    """
    FIX: Voice recognition adds trailing punctuation like 'notepad.' instead of 'notepad'.
    This strips trailing periods, commas, question marks, etc. from any name/query.
    """
    if not name:
        return ""
    cleaned = re.sub(r'[.,!?;:\s]+$', '', name.strip())
    return cleaned.lower().strip()

# === INIT AI PROVIDERS ===
OPENAI_CLIENT=None; ANTHROPIC_CLIENT=None; GEMINI_MODEL=None
GEMINI_AVAILABLE=False; ELEVEN_AVAILABLE=False; FAL_AVAILABLE=False

try:
    from openai import OpenAI
    if OPENAI_API_KEY and len(OPENAI_API_KEY)>20:
        OPENAI_CLIENT=OpenAI(api_key=OPENAI_API_KEY); logger.info("✅ OpenAI")
except Exception as e: logger.warning(f"OpenAI: {e}")

try:
    from anthropic import Anthropic
    if ANTHROPIC_API_KEY and len(ANTHROPIC_API_KEY)>20:
        ANTHROPIC_CLIENT=Anthropic(api_key=ANTHROPIC_API_KEY); logger.info("✅ Anthropic")
except Exception as e: logger.warning(f"Anthropic: {e}")

try:
    import google.generativeai as genai
    if GOOGLE_API_KEY and len(GOOGLE_API_KEY)>10:
        genai.configure(api_key=GOOGLE_API_KEY)
        GEMINI_MODEL=genai.GenerativeModel('gemini-1.5-flash'); GEMINI_AVAILABLE=True; logger.info("✅ Gemini")
except Exception as e: logger.warning(f"Gemini: {e}")

if ELEVEN_API_KEY and len(ELEVEN_API_KEY)>10:
    ELEVEN_AVAILABLE=True; logger.info("✅ ElevenLabs")

if FAL_KEY and len(FAL_KEY)>10:
    os.environ["FAL_KEY"]=FAL_KEY; FAL_AVAILABLE=True; logger.info("✅ FAL AI")

# === OPTIONAL FEATURES ===
PSUTIL_AVAILABLE=False; PIL_AVAILABLE=False; PYAUTOGUI_AVAILABLE=False
PYTTSX3_AVAILABLE=False; TTS_ENGINE=None; OPENCV_AVAILABLE=False

try:
    import psutil; PSUTIL_AVAILABLE=True; logger.info("✅ psutil")
except: pass

try:
    from PIL import ImageGrab, Image; PIL_AVAILABLE=True; logger.info("✅ Pillow")
except: pass

try:
    import pyautogui; pyautogui.FAILSAFE=False; PYAUTOGUI_AVAILABLE=True; logger.info("✅ PyAutoGUI")
except: pass

try:
    import pyttsx3; TTS_ENGINE=pyttsx3.init(); TTS_ENGINE.setProperty('rate',160); PYTTSX3_AVAILABLE=True; logger.info("✅ pyttsx3")
except: pass

try:
    import cv2; import numpy as np; OPENCV_AVAILABLE=True; logger.info("✅ OpenCV (screen recording)")
except: pass

# Screen recording global state
RECORDING_STATE = {"active": False, "process": None, "file": None, "start_time": None, "thread": None, "stop_event": None}

# ============================================================
class ElsaEngine:
    def __init__(self):
        self.history=[]
        self.PROMPT="""You are ELSA - an ultra-intelligent, warm, witty AI assistant.
You are ELSA, uniquely yourself. You know everything about every topic: science, tech,
history, culture, arts, sports, philosophy, coding, math, medicine, law, finance,
entertainment, travel, food, and much more.
Respond helpfully, accurately, with personality. Be conversational but smart."""

    def chat(self, msg, model="auto"):
        try:
            self.history.append({"role":"user","content":msg})
            if len(self.history)>30: self.history=self.history[-30:]
            res,mdl=None,None

            if model in("claude","anthropic") and ANTHROPIC_CLIENT:
                r=ANTHROPIC_CLIENT.messages.create(model="claude-sonnet-4-20250514",max_tokens=2048,system=self.PROMPT,messages=self.history)
                res=r.content[0].text; mdl="Claude Sonnet 4"
            elif model in("gpt","openai") and OPENAI_CLIENT:
                r=OPENAI_CLIENT.chat.completions.create(model="gpt-4o",messages=[{"role":"system","content":self.PROMPT}]+self.history,max_tokens=2048)
                res=r.choices[0].message.content; mdl="GPT-4o"
            elif model in("gemini","google") and GEMINI_AVAILABLE:
                r=GEMINI_MODEL.generate_content(self.PROMPT+"\n\nUser: "+msg); res=r.text; mdl="Gemini 1.5 Flash"
            else:
                if ANTHROPIC_CLIENT:
                    r=ANTHROPIC_CLIENT.messages.create(model="claude-sonnet-4-20250514",max_tokens=2048,system=self.PROMPT,messages=self.history)
                    res=r.content[0].text; mdl="Claude Sonnet 4"
                elif OPENAI_CLIENT:
                    r=OPENAI_CLIENT.chat.completions.create(model="gpt-4o",messages=[{"role":"system","content":self.PROMPT}]+self.history,max_tokens=2048)
                    res=r.choices[0].message.content; mdl="GPT-4o"
                elif GEMINI_AVAILABLE:
                    r=GEMINI_MODEL.generate_content(self.PROMPT+"\n\nUser: "+msg); res=r.text; mdl="Gemini 1.5 Flash"
                else:
                    res="No AI providers active. Rename your _env file to .env and restart backend."; mdl="none"

            self.history.append({"role":"assistant","content":res})
            return {"response":res,"model":mdl}
        except Exception as e:
            logger.error(traceback.format_exc())
            return {"response":f"Error: {e}","model":"error"}

    def elevenlabs_tts(self, text, voice_id="21m00Tcm4TlvDq8ikWAM"):
        if not ELEVEN_AVAILABLE: return None,"ElevenLabs not configured"
        try:
            r=req.post(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                json={"text":text,"model_id":"eleven_monolingual_v1","voice_settings":{"stability":0.5,"similarity_boost":0.75}},
                headers={"Accept":"audio/mpeg","Content-Type":"application/json","xi-api-key":ELEVEN_API_KEY},timeout=30)
            if r.status_code==200: return base64.b64encode(r.content).decode(),"success"
            return None,f"ElevenLabs {r.status_code}: {r.text}"
        except Exception as e: return None,str(e)

    def get_voices(self):
        if not ELEVEN_AVAILABLE: return []
        try:
            r=req.get("https://api.elevenlabs.io/v1/voices",headers={"xi-api-key":ELEVEN_API_KEY},timeout=10)
            return r.json().get("voices",[]) if r.status_code==200 else []
        except: return []

    def generate_image(self, prompt):
        if not FAL_AVAILABLE: return None,"FAL not configured"
        try:
            import fal_client
            res=fal_client.run("fal-ai/fast-sdxl",arguments={"prompt":prompt,"image_size":"landscape_4_3","num_inference_steps":28})
            if res and res.get("images"): return res["images"][0]["url"],"success"
            return None,"No image generated"
        except Exception as e: return None,str(e)

    # ============================================================
    # ✅ FIX 1: open_app — strips trailing punctuation from voice input
    # ============================================================
    def open_app(self, name):
        # Strip trailing punctuation (voice recognition adds "notepad." not "notepad")
        n = clean_name(name)
        logger.info(f"open_app: '{name}' → cleaned to: '{n}'")

        try:
            if CURRENT_OS == "Windows":
                builtin = {
                    'notepad': 'notepad', 'calculator': 'calc', 'calc': 'calc',
                    'paint': 'mspaint', 'ms paint': 'mspaint', 'wordpad': 'wordpad',
                    'task manager': 'taskmgr', 'taskmgr': 'taskmgr',
                    'control panel': 'control', 'command prompt': 'cmd', 'cmd': 'cmd',
                    'powershell': 'powershell', 'file explorer': 'explorer',
                    'explorer': 'explorer', 'snipping tool': 'SnippingTool',
                    'registry editor': 'regedit', 'regedit': 'regedit',
                    'device manager': 'devmgmt.msc', 'disk management': 'diskmgmt.msc',
                    'character map': 'charmap', 'on screen keyboard': 'osk',
                    'magnifier': 'magnify', 'sticky notes': 'StikyNot',
                    'remote desktop': 'mstsc', 'resource monitor': 'resmon',
                    'event viewer': 'eventvwr', 'services': 'services.msc',
                }
                settings_map = {
                    'settings': 'ms-settings:', 'windows settings': 'ms-settings:',
                    'wifi settings': 'ms-settings:network-wifi',
                    'bluetooth settings': 'ms-settings:bluetooth',
                    'display settings': 'ms-settings:display',
                    'sound settings': 'ms-settings:sound',
                }
                installed = {
                    'chrome': 'chrome', 'google chrome': 'chrome',
                    'edge': 'msedge', 'microsoft edge': 'msedge',
                    'firefox': 'firefox', 'brave': 'brave', 'opera': 'opera',
                    'word': 'winword', 'microsoft word': 'winword',
                    'excel': 'excel', 'microsoft excel': 'excel',
                    'powerpoint': 'powerpnt', 'microsoft powerpoint': 'powerpnt',
                    'outlook': 'outlook', 'onenote': 'onenote',
                    'teams': 'teams', 'microsoft teams': 'teams',
                    'notepad++': 'notepad++', 'vscode': 'code', 'vs code': 'code',
                    'visual studio code': 'code', 'visual studio': 'devenv',
                    'pycharm': 'pycharm64', 'android studio': 'studio64',
                    'sublime': 'sublime_text', 'sublime text': 'sublime_text',
                    'atom': 'atom', 'cursor': 'cursor', 'cursor ai': 'cursor',
                    'postman': 'postman', 'git bash': 'git-bash',
                    'windows terminal': 'wt', 'terminal': 'wt',
                    'discord': 'discord', 'slack': 'slack', 'zoom': 'zoom',
                    'skype': 'skype', 'whatsapp': 'whatsapp', 'telegram': 'telegram',
                    'signal': 'signal', 'spotify': 'spotify', 'vlc': 'vlc',
                    'vlc media player': 'vlc', 'obs': 'obs64', 'obs studio': 'obs64',
                    'audacity': 'audacity', 'itunes': 'itunes',
                    'media player': 'wmplayer', 'windows media player': 'wmplayer',
                    'photoshop': 'photoshop', 'illustrator': 'illustrator',
                    'premiere': 'premiere', 'premiere pro': 'premiere',
                    'after effects': 'afterfx', 'lightroom': 'lightroom',
                    'acrobat': 'acrobat', 'adobe acrobat': 'acrobat',
                    'gimp': 'gimp-2.10', 'inkscape': 'inkscape', 'blender': 'blender',
                    'steam': 'steam', 'epic games': 'epicgameslauncher',
                    'epic': 'epicgameslauncher', 'origin': 'origin',
                    '7zip': '7zfm', 'winrar': 'winrar', 'virtualbox': 'virtualbox',
                    'anydesk': 'anydesk', 'teamviewer': 'teamviewer',
                    'ccleaner': 'ccleaner', 'putty': 'putty', 'filezilla': 'filezilla',
                }

                # 1. Settings URIs
                if n in settings_map:
                    subprocess.Popen(f'start {settings_map[n]}', shell=True)
                    return {"success": True, "message": f"✅ Opening {n}..."}

                # 2. Built-in Windows commands
                if n in builtin:
                    subprocess.Popen(builtin[n], shell=True)
                    return {"success": True, "message": f"✅ Opening {n}..."}

                # 3. Known installed apps
                if n in installed:
                    subprocess.Popen(f'start "" {installed[n]}', shell=True)
                    return {"success": True, "message": f"✅ Opening {n}..."}

                # 4. Fuzzy match installed apps
                for key, exe in installed.items():
                    if key in n or n in key:
                        subprocess.Popen(f'start "" {exe}', shell=True)
                        return {"success": True, "message": f"✅ Opening {n}..."}

                # 5. Windows 'start' command — searches App Paths registry (best general fallback)
                r1 = subprocess.run(f'start "" {n}', shell=True, capture_output=True, timeout=5)
                if r1.returncode == 0:
                    return {"success": True, "message": f"✅ Opening {n}..."}

                # 6. Try with .exe suffix
                r2 = subprocess.run(f'start "" {n}.exe', shell=True, capture_output=True, timeout=5)
                if r2.returncode == 0:
                    return {"success": True, "message": f"✅ Opening {n}..."}

                # 7. PowerShell Start-Process as last resort
                ps = subprocess.run(
                    ['powershell', '-WindowStyle', 'Hidden', '-Command', f'Start-Process "{n}"'],
                    capture_output=True, text=True, timeout=5)
                if ps.returncode == 0:
                    return {"success": True, "message": f"✅ Opening {n}..."}

                return {"success": False, "message": f"❌ Could not open '{n}'. Make sure it is installed."}

            elif CURRENT_OS == "Darwin":
                mac = {
                    'chrome': 'Google Chrome', 'safari': 'Safari', 'firefox': 'Firefox',
                    'vscode': 'Visual Studio Code', 'vs code': 'Visual Studio Code',
                    'terminal': 'Terminal', 'finder': 'Finder', 'spotify': 'Spotify',
                    'discord': 'Discord', 'slack': 'Slack', 'zoom': 'zoom.us',
                    'notes': 'Notes', 'music': 'Music', 'photos': 'Photos',
                    'mail': 'Mail', 'calendar': 'Calendar',
                }
                app_name = mac.get(n, name)
                r = subprocess.run(['open', '-a', app_name], capture_output=True, text=True)
                if r.returncode == 0:
                    return {"success": True, "message": f"✅ Opening {n}..."}
                return {"success": False, "message": f"❌ App not found: {n}"}

            else:  # Linux
                linux = {
                    'chrome': 'google-chrome', 'firefox': 'firefox',
                    'terminal': 'gnome-terminal', 'vscode': 'code', 'vs code': 'code',
                    'vlc': 'vlc', 'gimp': 'gimp', 'calculator': 'gnome-calculator',
                }
                subprocess.Popen([linux.get(n, n)])
                return {"success": True, "message": f"✅ Opening {n}..."}

        except Exception as e:
            logger.error(traceback.format_exc())
            return {"success": False, "message": f"❌ Could not open '{n}': {str(e)}"}

    def open_site(self, url):
        s={'google':'https://www.google.com','youtube':'https://www.youtube.com',
            'facebook':'https://www.facebook.com','twitter':'https://www.twitter.com',
            'x':'https://www.x.com','instagram':'https://www.instagram.com',
            'reddit':'https://www.reddit.com','linkedin':'https://www.linkedin.com',
            'github':'https://www.github.com','stackoverflow':'https://stackoverflow.com',
            'amazon':'https://www.amazon.com','flipkart':'https://www.flipkart.com',
            'netflix':'https://www.netflix.com','hotstar':'https://www.hotstar.com',
            'wikipedia':'https://www.wikipedia.org','gmail':'https://mail.google.com',
            'outlook':'https://outlook.com','chatgpt':'https://chat.openai.com',
            'claude':'https://claude.ai','gemini':'https://gemini.google.com',
            'bing':'https://www.bing.com','maps':'https://maps.google.com',
            'translate':'https://translate.google.com','drive':'https://drive.google.com',
            'docs':'https://docs.google.com','sheets':'https://sheets.google.com',
            'meet':'https://meet.google.com','whatsapp':'https://web.whatsapp.com',
            'telegram':'https://web.telegram.org','discord':'https://discord.com/app',
            'spotify':'https://open.spotify.com','twitch':'https://www.twitch.tv',
            'tiktok':'https://www.tiktok.com','notion':'https://www.notion.so',
            'canva':'https://www.canva.com','figma':'https://www.figma.com',
            'codepen':'https://codepen.io','replit':'https://replit.com'}
        u = clean_name(url)
        if u in s: final=s[u]
        elif not u.startswith(('http://','https://')): final=('https://www.'+u+'.com') if '.' not in u else 'https://'+u
        else: final=u
        webbrowser.open(final)
        return {"success":True,"message":f"✅ Opening {u}..."}

    def play_yt(self, q):
        q = clean_name(q)
        webbrowser.open(f"https://www.youtube.com/results?search_query={urllib.parse.quote(q)}")
        return {"success":True,"message":f"✅ Playing '{q}' on YouTube..."}

    def search(self, engine, q):
        q = clean_name(q)
        q_enc = urllib.parse.quote(q)
        urls = {
            'google':    f"https://www.google.com/search?q={q_enc}",
            'bing':      f"https://www.bing.com/search?q={q_enc}",
            'edge':      f"https://www.bing.com/search?q={q_enc}",
            'chrome':    f"https://www.google.com/search?q={q_enc}",
            'youtube':   f"https://www.youtube.com/results?search_query={q_enc}",
            'wikipedia': f"https://en.wikipedia.org/wiki/Special:Search?search={q_enc}",
            'chatgpt':   f"https://chatgpt.com/?q={q_enc}",
            'claude':    "https://claude.ai",
            'gemini':    "https://gemini.google.com",
        }
        url = urls.get(engine, urls['google'])
        if CURRENT_OS == "Windows":
            if engine == 'edge':
                subprocess.Popen(f'start msedge "{url}"', shell=True)
            elif engine == 'chrome':
                subprocess.Popen(f'start chrome "{url}"', shell=True)
            elif engine == 'youtube':
                subprocess.Popen(f'start msedge "{url}"', shell=True)
            else:
                webbrowser.open(url)
        else:
            webbrowser.open(url)
        return {"success": True, "message": f"✅ Searching {engine} for: {q}", "url": url}

    def screenshot(self):
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        if not os.path.isdir(desktop):
            desktop = os.path.expanduser("~")
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        fn = f"elsa_screenshot_{ts}.png"
        save_path = os.path.join(desktop, fn)
        try:
            if PIL_AVAILABLE:
                from PIL import ImageGrab
                ss = ImageGrab.grab()
                ss.save(save_path)
                buf = BytesIO(); ss.save(buf, format="PNG")
                img_b64 = base64.b64encode(buf.getvalue()).decode()
                return {"success": True, "message": f"✅ Screenshot saved to Desktop: {fn}", "image": img_b64, "filename": fn}
            elif PYAUTOGUI_AVAILABLE:
                ss = pyautogui.screenshot()
                ss.save(save_path)
                buf = BytesIO(); ss.save(buf, format="PNG")
                img_b64 = base64.b64encode(buf.getvalue()).decode()
                return {"success": True, "message": f"✅ Screenshot saved: {fn}", "image": img_b64, "filename": fn}
            else:
                return {"success": False, "message": "❌ Install Pillow: pip install pillow"}
        except Exception as e:
            return {"success": False, "message": f"❌ Screenshot error: {str(e)}"}

    # ============================================================
    # ✅ FIX 2: SCREEN RECORDING — fully working implementation
    # ============================================================
    def start_recording(self):
        """Start screen recording with multiple methods."""
        if RECORDING_STATE["active"]:
            return {"success": False, "message": "⚠️ Already recording! Say 'stop recording' first."}

        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        if not os.path.isdir(desktop):
            desktop = os.path.expanduser("~")
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')

        # ── Method 1: OpenCV + Pillow (best quality, saves .avi to Desktop) ──
        if OPENCV_AVAILABLE and PIL_AVAILABLE:
            try:
                from PIL import ImageGrab
                import numpy as np
                test_frame = ImageGrab.grab()
                w, h = test_frame.size
                save_path = os.path.join(desktop, f"elsa_recording_{ts}.avi")
                fourcc = cv2.VideoWriter_fourcc(*'XVID')
                writer = cv2.VideoWriter(save_path, fourcc, 10.0, (w, h))
                if not writer.isOpened():
                    raise RuntimeError("VideoWriter could not be opened")

                stop_event = threading.Event()
                RECORDING_STATE.update({
                    "active": True, "file": save_path,
                    "start_time": datetime.now().isoformat(),
                    "stop_event": stop_event, "process": None
                })

                def _record_loop():
                    try:
                        while not stop_event.is_set():
                            frame = ImageGrab.grab()
                            frame_bgr = cv2.cvtColor(np.array(frame), cv2.COLOR_RGB2BGR)
                            writer.write(frame_bgr)
                            time.sleep(0.1)
                    except Exception as ex:
                        logger.error(f"Recording error: {ex}")
                    finally:
                        writer.release()
                        RECORDING_STATE["active"] = False
                        logger.info(f"Recording saved: {save_path}")

                t = threading.Thread(target=_record_loop, daemon=True)
                RECORDING_STATE["thread"] = t
                t.start()
                fn = os.path.basename(save_path)
                return {
                    "success": True, "recording": True,
                    "message": f"🔴 Recording started! Saving to Desktop: {fn}",
                    "file": save_path, "method": "opencv+pillow"
                }
            except Exception as e:
                RECORDING_STATE["active"] = False
                logger.warning(f"OpenCV+PIL recording failed: {e}, trying next method...")

        # ── Method 1b: OpenCV + PyAutoGUI ────────────────────────────────────
        if OPENCV_AVAILABLE and PYAUTOGUI_AVAILABLE and not PIL_AVAILABLE:
            try:
                import numpy as np
                test_frame = pyautogui.screenshot()
                w, h = test_frame.size
                save_path = os.path.join(desktop, f"elsa_recording_{ts}.avi")
                fourcc = cv2.VideoWriter_fourcc(*'XVID')
                writer = cv2.VideoWriter(save_path, fourcc, 10.0, (w, h))
                stop_event = threading.Event()
                RECORDING_STATE.update({
                    "active": True, "file": save_path,
                    "start_time": datetime.now().isoformat(),
                    "stop_event": stop_event, "process": None
                })

                def _record_loop2():
                    try:
                        while not stop_event.is_set():
                            frame = pyautogui.screenshot()
                            frame_bgr = cv2.cvtColor(np.array(frame), cv2.COLOR_RGB2BGR)
                            writer.write(frame_bgr)
                            time.sleep(0.1)
                    finally:
                        writer.release()
                        RECORDING_STATE["active"] = False

                t = threading.Thread(target=_record_loop2, daemon=True)
                RECORDING_STATE["thread"] = t
                t.start()
                fn = os.path.basename(save_path)
                return {
                    "success": True, "recording": True,
                    "message": f"🔴 Recording started! Saving to Desktop: {fn}",
                    "file": save_path, "method": "opencv+pyautogui"
                }
            except Exception as e:
                RECORDING_STATE["active"] = False
                logger.warning(f"OpenCV+PyAutoGUI recording failed: {e}")

        # ── Method 2: Windows Game Bar via PyAutoGUI hotkey ──────────────────
        if CURRENT_OS == "Windows" and PYAUTOGUI_AVAILABLE:
            try:
                pyautogui.hotkey('win', 'alt', 'r')   # ✅ just call it, don't check return
                RECORDING_STATE.update({
                    "active": True, "file": "Videos/Captures folder",
                    "start_time": datetime.now().isoformat(),
                    "stop_event": None, "process": None
                })
                return {
                    "success": True, "recording": True,
                    "message": "🔴 Recording started via Windows Game Bar! Saved to Videos → Captures.",
                    "method": "gamebar"
                }
            except Exception as e:
                logger.error(f"Game Bar hotkey failed: {e}")

        # ── Method 3: Windows Game Bar without PyAutoGUI ─────────────────────
        if CURRENT_OS == "Windows":
            subprocess.Popen('explorer ms-gamingoverlay://', shell=True)
            return {
                "success": True, "recording": False,
                "message": (
                    "⚠️ Opened Xbox Game Bar. Press Win+Alt+R to start recording.\n"
                    "For hands-free recording, install: pip install opencv-python pillow"
                ),
                "method": "gamebar_manual"
            }

        # ── Method 4: macOS screencapture ────────────────────────────────────
        if CURRENT_OS == "Darwin":
            try:
                save_path = os.path.join(desktop, f"elsa_recording_{ts}.mp4")
                proc = subprocess.Popen(['screencapture', '-v', save_path])
                RECORDING_STATE.update({
                    "active": True, "process": proc, "file": save_path,
                    "start_time": datetime.now().isoformat(), "stop_event": None
                })
                return {
                    "success": True, "recording": True,
                    "message": f"🔴 Recording started! Saving to: {save_path}",
                    "method": "macos_screencapture"
                }
            except Exception as e:
                return {"success": False, "message": f"❌ Recording failed: {e}"}

        return {
            "success": False,
            "message": "❌ Screen recording needs: pip install opencv-python pillow\nThen restart the backend."
        }

    def stop_recording(self):
        """Stop active screen recording."""
        if not RECORDING_STATE["active"]:
            return {"success": False, "message": "⚠️ No recording is currently active."}

        saved_file = RECORDING_STATE.get("file", "unknown")

        # Stop software recording thread (OpenCV)
        stop_event = RECORDING_STATE.get("stop_event")
        if stop_event and not stop_event.is_set():
            stop_event.set()
            t = RECORDING_STATE.get("thread")
            if t:
                t.join(timeout=5)
            RECORDING_STATE.update({"active": False, "stop_event": None, "thread": None})
            return {
                "success": True, "recording": False,
                "message": f"⏹️ Recording stopped! Saved to Desktop: {os.path.basename(saved_file)}"
            }

        # Stop macOS screencapture
        proc = RECORDING_STATE.get("process")
        if proc:
            proc.terminate()
            RECORDING_STATE.update({"active": False, "process": None})
            return {"success": True, "recording": False,
                    "message": f"⏹️ Recording stopped! Saved to: {saved_file}"}

        # Stop Windows Game Bar
        if CURRENT_OS == "Windows" and PYAUTOGUI_AVAILABLE:
            pyautogui.hotkey('win', 'alt', 'r')
            RECORDING_STATE["active"] = False
            return {"success": True, "recording": False,
                    "message": "⏹️ Recording stopped! Check Videos → Captures folder."}

        RECORDING_STATE["active"] = False
        return {"success": True, "recording": False, "message": "⏹️ Recording stopped."}

    def recording_status(self):
        """Return current recording status with elapsed time."""
        duration = None
        if RECORDING_STATE.get("start_time") and RECORDING_STATE["active"]:
            try:
                start = datetime.fromisoformat(RECORDING_STATE["start_time"])
                elapsed = (datetime.now() - start).total_seconds()
                duration = f"{int(elapsed//60):02d}:{int(elapsed%60):02d}"
            except: pass
        return {
            "success": True,
            "recording": RECORDING_STATE["active"],
            "file": RECORDING_STATE.get("file"),
            "duration": duration,
            "capabilities": {
                "opencv": OPENCV_AVAILABLE,
                "pil": PIL_AVAILABLE,
                "pyautogui": PYAUTOGUI_AVAILABLE,
                "ready": OPENCV_AVAILABLE and (PIL_AVAILABLE or PYAUTOGUI_AVAILABLE),
                "install_hint": None if OPENCV_AVAILABLE else "pip install opencv-python pillow"
            }
        }

    # ============================================================
    # KEYBOARD, MOUSE, CLIPBOARD, SYSTEM EXTRAS
    # ============================================================
    def type_text(self, text):
        if not PYAUTOGUI_AVAILABLE:
            return {"success": False, "message": "❌ Install: pip install pyautogui"}
        try:
            time.sleep(0.5)
            pyautogui.write(text, interval=0.04)
            return {"success": True, "message": f"✅ Typed: {text}"}
        except Exception as e:
            return {"success": False, "message": f"❌ Type error: {e}"}

    def press_key(self, key):
        if not PYAUTOGUI_AVAILABLE:
            return {"success": False, "message": "❌ Install: pip install pyautogui"}
        try:
            k = clean_name(key)
            key_map = {
                'enter':'enter','return':'enter','escape':'esc','esc':'esc',
                'space':'space','tab':'tab','backspace':'backspace',
                'up':'up','down':'down','left':'left','right':'right',
                'volume up':'volumeup','volume down':'volumedown','mute':'volumemute',
                'play':'playpause','play pause':'playpause','pause':'playpause',
                'next track':'nexttrack','previous track':'prevtrack','prev track':'prevtrack',
                'print screen':'printscreen','home':'home','end':'end',
                'page up':'pageup','page down':'pagedown','delete':'delete',
                'f1':'f1','f2':'f2','f3':'f3','f4':'f4','f5':'f5',
                'f6':'f6','f7':'f7','f8':'f8','f9':'f9','f10':'f10','f11':'f11','f12':'f12',
            }
            if k == 'alt f4':
                pyautogui.hotkey('alt', 'f4')
            elif '+' in k:
                parts = [p.strip() for p in k.split('+')]
                pyautogui.hotkey(*parts)
            else:
                pyautogui.press(key_map.get(k, k))
            return {"success": True, "message": f"✅ Pressed: {key}"}
        except Exception as e:
            return {"success": False, "message": f"❌ Key error: {e}"}

    def clipboard_set(self, text):
        try:
            if CURRENT_OS == "Windows":
                subprocess.run(['clip'], input=text.encode('utf-8'), check=True)
            elif CURRENT_OS == "Darwin":
                subprocess.run(['pbcopy'], input=text.encode('utf-8'), check=True)
            else:
                subprocess.run(['xclip', '-selection', 'clipboard'], input=text.encode('utf-8'), check=True)
            return {"success": True, "message": "✅ Copied to clipboard!"}
        except Exception as e:
            return {"success": False, "message": f"❌ Clipboard error: {e}"}

    def clipboard_get(self):
        try:
            if CURRENT_OS == "Windows":
                r = subprocess.run(['powershell', '-Command', 'Get-Clipboard'], capture_output=True, text=True)
                return {"success": True, "text": r.stdout.strip()}
            elif CURRENT_OS == "Darwin":
                r = subprocess.run(['pbpaste'], capture_output=True, text=True)
                return {"success": True, "text": r.stdout.strip()}
            else:
                r = subprocess.run(['xclip', '-selection', 'clipboard', '-o'], capture_output=True, text=True)
                return {"success": True, "text": r.stdout.strip()}
        except Exception as e:
            return {"success": False, "message": f"❌ Clipboard error: {e}"}

    def move_mouse(self, x, y):
        if not PYAUTOGUI_AVAILABLE:
            return {"success": False, "message": "❌ Install: pip install pyautogui"}
        try:
            pyautogui.moveTo(int(x), int(y), duration=0.3)
            return {"success": True, "message": f"✅ Mouse at ({x},{y})"}
        except Exception as e:
            return {"success": False, "message": f"❌ {e}"}

    def click_mouse(self, x=None, y=None, button='left'):
        if not PYAUTOGUI_AVAILABLE:
            return {"success": False, "message": "❌ Install: pip install pyautogui"}
        try:
            if x is not None and y is not None:
                pyautogui.click(int(x), int(y), button=button)
            else:
                pyautogui.click(button=button)
            return {"success": True, "message": f"✅ {button.capitalize()} clicked"}
        except Exception as e:
            return {"success": False, "message": f"❌ {e}"}

    def scroll(self, direction='down', amount=3):
        if not PYAUTOGUI_AVAILABLE:
            return {"success": False, "message": "❌ Install: pip install pyautogui"}
        try:
            clicks = -int(amount) if direction == 'down' else int(amount)
            pyautogui.scroll(clicks)
            return {"success": True, "message": f"✅ Scrolled {direction}"}
        except Exception as e:
            return {"success": False, "message": f"❌ {e}"}

    def open_folder(self, path):
        try:
            path_map = {
                'desktop': os.path.join(os.path.expanduser("~"), "Desktop"),
                'documents': os.path.join(os.path.expanduser("~"), "Documents"),
                'downloads': os.path.join(os.path.expanduser("~"), "Downloads"),
                'pictures': os.path.join(os.path.expanduser("~"), "Pictures"),
                'music': os.path.join(os.path.expanduser("~"), "Music"),
                'videos': os.path.join(os.path.expanduser("~"), "Videos"),
                'home': os.path.expanduser("~"),
            }
            resolved = path_map.get(clean_name(path), path)
            if CURRENT_OS == "Windows":
                subprocess.Popen(f'explorer "{resolved}"', shell=True)
            elif CURRENT_OS == "Darwin":
                subprocess.Popen(['open', resolved])
            else:
                subprocess.Popen(['xdg-open', resolved])
            return {"success": True, "message": f"✅ Opened: {resolved}"}
        except Exception as e:
            return {"success": False, "message": f"❌ {e}"}

    def battery_info(self):
        if not PSUTIL_AVAILABLE:
            return {"success": False, "message": "pip install psutil"}
        try:
            b = psutil.sensors_battery()
            if b is None:
                return {"success": True, "message": "No battery (desktop PC)", "has_battery": False}
            time_str = "Charging" if b.secsleft == psutil.POWER_TIME_UNLIMITED else f"{int(b.secsleft//60)} min"
            return {"success": True, "has_battery": True, "percent": round(b.percent, 1),
                    "plugged": b.power_plugged, "time_left": time_str,
                    "message": f"🔋 {round(b.percent)}% {'🔌 Charging' if b.power_plugged else f'| {time_str} left'}"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def wifi_info(self):
        try:
            if CURRENT_OS == "Windows":
                r = subprocess.run(['netsh', 'wlan', 'show', 'interfaces'], capture_output=True, text=True, timeout=5)
                info = {}
                for line in r.stdout.split('\n'):
                    if ':' in line:
                        k, _, v = line.partition(':')
                        info[k.strip()] = v.strip()
                ssid = info.get('SSID', 'Unknown')
                signal = info.get('Signal', 'Unknown')
                return {"success": True, "ssid": ssid, "signal": signal,
                        "message": f"📶 WiFi: {ssid} | Signal: {signal}"}
            elif CURRENT_OS == "Darwin":
                r = subprocess.run(['/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport', '-I'],
                                   capture_output=True, text=True, timeout=5)
                return {"success": True, "raw": r.stdout[:400]}
            else:
                r = subprocess.run(['iwconfig'], capture_output=True, text=True, timeout=5)
                return {"success": True, "raw": r.stdout[:400]}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def kill_process(self, name):
        try:
            n = clean_name(name)
            if CURRENT_OS == "Windows":
                exe = n if n.endswith('.exe') else n + '.exe'
                r = subprocess.run(['taskkill', '/F', '/IM', exe], capture_output=True, text=True)
                if r.returncode == 0:
                    return {"success": True, "message": f"✅ Killed: {n}"}
                return {"success": False, "message": f"❌ Process not found: {n}"}
            else:
                subprocess.run(['pkill', '-f', n])
                return {"success": True, "message": f"✅ Killed: {n}"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def sys_info(self):
        info={"os":CURRENT_OS,"os_version":platform.version(),"machine":platform.machine(),
              "processor":platform.processor(),"hostname":platform.node(),
              "python":platform.python_version(),"time":datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        if PSUTIL_AVAILABLE:
            info["cpu_usage"]=psutil.cpu_percent(interval=0.5); info["cpu_cores"]=psutil.cpu_count()
            m=psutil.virtual_memory()
            info.update({"memory_total":round(m.total/(1024**3),2),"memory_used":round(m.used/(1024**3),2),"memory_percent":m.percent})
            try:
                d=psutil.disk_usage('/')
                info.update({"disk_total":round(d.total/(1024**3),2),"disk_used":round(d.used/(1024**3),2),"disk_percent":d.percent})
            except: pass
        return {"success":True,"info":info}

    def running_apps(self):
        if not PSUTIL_AVAILABLE: return {"success":False,"message":"pip install psutil"}
        procs=[]
        for p in psutil.process_iter(['pid','name','memory_info','status']):
            try:
                m=p.info['memory_info']
                if m: procs.append({"pid":p.info['pid'],"name":p.info['name'],
                                     "memory":round(m.rss/(1024*1024),1),"status":p.info['status']})
            except: pass
        procs.sort(key=lambda x:x['memory'],reverse=True)
        return {"success":True,"processes":procs[:20]}

    def power(self, action, delay=5):
        cmds={"shutdown":{"Windows":f"shutdown /s /t {delay}","Linux":"shutdown -h now","Darwin":"sudo shutdown -h now"},
              "restart":{"Windows":f"shutdown /r /t {delay}","Linux":"reboot","Darwin":"sudo shutdown -r now"},
              "sleep":{"Windows":"rundll32.exe powrprof.dll,SetSuspendState 0,1,0","Darwin":"pmset sleepnow","Linux":"systemctl suspend"},
              "cancel":{"Windows":"shutdown /a"}}
        msg_map={"shutdown":f"✅ Shutdown in {delay}s","restart":f"✅ Restart in {delay}s","sleep":"✅ Going to sleep...","cancel":"✅ Shutdown cancelled!"}
        cmd=cmds.get(action,{}).get(CURRENT_OS)
        if cmd: os.system(cmd)
        return {"success":True,"message":msg_map.get(action,"Done")}

    def lock(self):
        try:
            if CURRENT_OS=="Windows": import ctypes; ctypes.windll.user32.LockWorkStation()
            elif CURRENT_OS=="Darwin": os.system('pmset displaysleepnow')
            elif CURRENT_OS=="Linux": os.system('gnome-screensaver-command -l')
            return {"success":True,"message":"✅ Screen locked!"}
        except Exception as e: return {"success":False,"message":str(e)}

    def speak(self, text):
        if PYTTSX3_AVAILABLE:
            def _s():
                try: TTS_ENGINE.say(text); TTS_ENGINE.runAndWait()
                except: pass
            threading.Thread(target=_s, daemon=True).start()

    def clear(self):
        self.history=[]; return {"success":True,"message":"✅ History cleared!"}


elsa = ElsaEngine()

# ============================================================
# ROUTES
# ============================================================
@app.route('/')
def home():
    return jsonify({"name": "ELSA 4.0", "status": "ok", "os": CURRENT_OS})

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status":"healthy","os":CURRENT_OS,
        "providers":{"openai":OPENAI_CLIENT is not None,"anthropic":ANTHROPIC_CLIENT is not None,
                     "google":GEMINI_AVAILABLE,"elevenlabs":ELEVEN_AVAILABLE,"fal":FAL_AVAILABLE},
        "features":{"screenshot":PIL_AVAILABLE or PYAUTOGUI_AVAILABLE,
                    "screen_recording":OPENCV_AVAILABLE and (PIL_AVAILABLE or PYAUTOGUI_AVAILABLE),
                    "tts_local":PYTTSX3_AVAILABLE,"tts_eleven":ELEVEN_AVAILABLE,
                    "system_info":PSUTIL_AVAILABLE,"desktop_control":PYAUTOGUI_AVAILABLE}})

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data=request.get_json() or {}
        msg=data.get('message','').strip()
        if not msg: return jsonify({"error":"Empty message"}),400
        r=elsa.chat(msg, data.get('model','auto'))
        return jsonify({"success":True,"response":r['response'],"model":r['model']})
    except Exception as e: return jsonify({"error":str(e)}),500

@app.route('/api/process', methods=['POST'])
def process(): return chat()

@app.route('/api/command', methods=['POST'])
def command():
    try:
        data=request.get_json() or {}
        a=data.get('action',''); p=data.get('params',{})
        fn = {
            'open_app':         lambda: elsa.open_app(p.get('name','')),
            'open_website':     lambda: elsa.open_site(p.get('url','')),
            'play_youtube':     lambda: elsa.play_yt(p.get('query','')),
            'search_google':    lambda: elsa.search('google', p.get('query','')),
            'search_wikipedia': lambda: elsa.search('wikipedia', p.get('query','')),
            'search_edge':      lambda: elsa.search('edge', p.get('query','')),
            'search_chrome':    lambda: elsa.search('chrome', p.get('query','')),
            'open_chatgpt':     lambda: elsa.search('chatgpt', p.get('prompt','')),
            'open_claude':      lambda: elsa.search('claude', ''),
            'screenshot':       lambda: elsa.screenshot(),
            # ✅ FIXED recording
            'start_recording':  lambda: elsa.start_recording(),
            'stop_recording':   lambda: elsa.stop_recording(),
            'recording_status': lambda: elsa.recording_status(),
            # Keyboard & Mouse
            'type_text':        lambda: elsa.type_text(p.get('text','')),
            'press_key':        lambda: elsa.press_key(p.get('key','')),
            'click_mouse':      lambda: elsa.click_mouse(p.get('x'), p.get('y'), p.get('button','left')),
            'move_mouse':       lambda: elsa.move_mouse(p.get('x',0), p.get('y',0)),
            'scroll':           lambda: elsa.scroll(p.get('direction','down'), p.get('amount',3)),
            # Clipboard
            'clipboard_set':    lambda: elsa.clipboard_set(p.get('text','')),
            'clipboard_get':    lambda: elsa.clipboard_get(),
            # System
            'system_info':      lambda: elsa.sys_info(),
            'running_apps':     lambda: elsa.running_apps(),
            'battery_info':     lambda: elsa.battery_info(),
            'wifi_info':        lambda: elsa.wifi_info(),
            'open_folder':      lambda: elsa.open_folder(p.get('path','desktop')),
            'kill_process':     lambda: elsa.kill_process(p.get('name','')),
            'shutdown':         lambda: elsa.power('shutdown', p.get('delay',5)),
            'restart':          lambda: elsa.power('restart', p.get('delay',5)),
            'sleep':            lambda: elsa.power('sleep'),
            'cancel_shutdown':  lambda: elsa.power('cancel'),
            'lock_screen':      lambda: elsa.lock(),
            'clear_history':    lambda: elsa.clear(),
            'get_time':         lambda: {"success":True,
                                         "time":datetime.now().strftime("%I:%M %p"),
                                         "date":datetime.now().strftime("%A, %B %d, %Y")},
        }.get(a)
        return jsonify(fn() if fn else {"success":False,"message":f"Unknown action: {a}"})
    except Exception as e:
        return jsonify({"error":str(e)}),500

# Direct routes
@app.route('/api/screenshot',            methods=['GET','POST']) 
def ss():           return jsonify(elsa.screenshot())

@app.route('/api/system/info',           methods=['GET'])        
def sinfo():        return jsonify(elsa.sys_info())

@app.route('/api/system/apps',           methods=['GET'])        
def sapps():        return jsonify(elsa.running_apps())

@app.route('/api/system/open-app',       methods=['POST'])       
def oa():           return jsonify(elsa.open_app((request.get_json() or {}).get('app_name','')))

@app.route('/api/system/battery',        methods=['GET'])        
def battery():      return jsonify(elsa.battery_info())

@app.route('/api/system/wifi',           methods=['GET'])        
def wifi():         return jsonify(elsa.wifi_info())

@app.route('/api/system/open-folder',    methods=['POST'])       
def open_folder():  return jsonify(elsa.open_folder((request.get_json() or {}).get('path','desktop')))

@app.route('/api/system/kill-process',   methods=['POST'])       
def kill_proc():    return jsonify(elsa.kill_process((request.get_json() or {}).get('name','')))

@app.route('/api/recording/start',       methods=['POST'])       
def rec_start():    return jsonify(elsa.start_recording())

@app.route('/api/recording/stop',        methods=['POST'])       
def rec_stop():     return jsonify(elsa.stop_recording())

@app.route('/api/recording/status',      methods=['GET'])        
def rec_status():   return jsonify(elsa.recording_status())

@app.route('/api/keyboard/type',         methods=['POST'])       
def kbd_type():     return jsonify(elsa.type_text((request.get_json() or {}).get('text','')))

@app.route('/api/keyboard/press',        methods=['POST'])       
def kbd_press():    return jsonify(elsa.press_key((request.get_json() or {}).get('key','')))

@app.route('/api/mouse/move',            methods=['POST'])       
def mouse_move():
    d=request.get_json() or {}; return jsonify(elsa.move_mouse(d.get('x',0), d.get('y',0)))

@app.route('/api/mouse/click',           methods=['POST'])       
def mouse_click():
    d=request.get_json() or {}; return jsonify(elsa.click_mouse(d.get('x'), d.get('y'), d.get('button','left')))

@app.route('/api/mouse/scroll',          methods=['POST'])       
def mouse_scroll():
    d=request.get_json() or {}; return jsonify(elsa.scroll(d.get('direction','down'), d.get('amount',3)))

@app.route('/api/clipboard/set',         methods=['POST'])       
def clip_set():     return jsonify(elsa.clipboard_set((request.get_json() or {}).get('text','')))

@app.route('/api/clipboard/get',         methods=['GET'])        
def clip_get():     return jsonify(elsa.clipboard_get())

@app.route('/api/tts/elevenlabs',        methods=['POST'])
def tts():
    data=request.get_json() or {}; text=data.get('text','')
    if not text: return jsonify({"error":"No text"}),400
    audio,msg=elsa.elevenlabs_tts(text, data.get('voice_id','21m00Tcm4TlvDq8ikWAM'))
    return jsonify({"success":bool(audio),"audio":audio,"message":msg})

@app.route('/api/tts/voices',            methods=['GET'])        
def voices():       return jsonify({"success":True,"voices":elsa.get_voices()})

@app.route('/api/image/generate',        methods=['POST'])
def genimg():
    prompt=(request.get_json() or {}).get('prompt','')
    if not prompt: return jsonify({"error":"No prompt"}),400
    url,msg=elsa.generate_image(prompt)
    return jsonify({"success":bool(url),"url":url,"message":msg})

@app.route('/api/clear',                 methods=['POST'])       
def clear():        return jsonify(elsa.clear())

@app.route('/api/status',               methods=['GET'])
def status():
    return jsonify({"status":"operational","os":CURRENT_OS,
        "keys":{"openai":mask(OPENAI_API_KEY),"anthropic":mask(ANTHROPIC_API_KEY),
                "google":mask(GOOGLE_API_KEY),"elevenlabs":mask(ELEVEN_API_KEY),"fal":mask(FAL_KEY)},
        "providers":{"openai":OPENAI_CLIENT is not None,"anthropic":ANTHROPIC_CLIENT is not None,
                     "gemini":GEMINI_AVAILABLE,"elevenlabs":ELEVEN_AVAILABLE,"fal":FAL_AVAILABLE}})

if __name__=='__main__':
    print("\n"+"="*70)
    print("  🤖  ELSA 4.0 — ULTRA ADVANCED AI ASSISTANT")
    print("="*70)
    print(f"  🌐  Server : http://localhost:5000")
    print(f"  📊  Status : http://localhost:5000/api/status")
    print(f"  🖥️   OS     : {CURRENT_OS}")
    print()
    print("  AI Providers:")
    print(f"  {'✅' if ANTHROPIC_CLIENT  else '❌'}  Anthropic  {mask(ANTHROPIC_API_KEY)}")
    print(f"  {'✅' if OPENAI_CLIENT     else '❌'}  OpenAI     {mask(OPENAI_API_KEY)}")
    print(f"  {'✅' if GEMINI_AVAILABLE  else '❌'}  Google     {mask(GOOGLE_API_KEY)}")
    print(f"  {'✅' if ELEVEN_AVAILABLE  else '❌'}  ElevenLabs {mask(ELEVEN_API_KEY)}")
    print(f"  {'✅' if FAL_AVAILABLE     else '❌'}  FAL AI     {mask(FAL_KEY)}")
    print()
    print("  System Features:")
    rec_ready = OPENCV_AVAILABLE and (PIL_AVAILABLE or PYAUTOGUI_AVAILABLE)
    print(f"  {'✅' if rec_ready          else '❌'}  Screen Recording {'(ready!)' if rec_ready else '→ pip install opencv-python pillow'}")
    print(f"  {'✅' if PIL_AVAILABLE      else '❌'}  Screenshots      (pillow)")
    print(f"  {'✅' if PYAUTOGUI_AVAILABLE else '❌'}  Mouse/Keyboard   (pyautogui)")
    print(f"  {'✅' if PSUTIL_AVAILABLE   else '❌'}  System Info      (psutil)")
    print(f"  {'✅' if PYTTSX3_AVAILABLE  else '❌'}  Local TTS        (pyttsx3)")
    print()
    if not any([OPENAI_CLIENT, ANTHROPIC_CLIENT, GEMINI_AVAILABLE]):
        print("  ⚠️  RENAME  _env  →  .env  then restart!")
    print("="*70+"\n")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)