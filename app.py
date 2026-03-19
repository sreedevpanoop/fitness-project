# -*- coding: utf-8 -*-
"""
FitnessAGNT – Fitness Predictor Suite - Flask Backend v2
Models: Muscle Recovery | Daily Calories | Macro & Meal Plan
Database: Supabase (PostgreSQL)
Auth: Gmail login, email verification, forgot password, unified admin
"""
import sys, io, os, json, pickle, hashlib, datetime, secrets, smtplib, random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import numpy as np
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory
import joblib
from supabase import create_client, Client

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=STATIC_DIR)

# ── Supabase Config ──────────────────────────────────────────────────────────
SUPABASE_URL = "https://sftrlxvbtpjrlbwxzaat.supabase.co"
SUPABASE_KEY = "sb_publishable_DqLxzaMjX6IRG8S3F4TR8A_fnuecer-"
db: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("[OK] Supabase client connected.")

# ── Admin Config ─────────────────────────────────────────────────────────────
ADMIN_TOKEN = hashlib.sha256("admin_secret_token_fitnessagnt".encode()).hexdigest()

# ── Mail Config (set env vars MAIL_USER and MAIL_PASS before running) ────────
MAIL_USER = os.environ.get("MAIL_USER", "sreedevpanoop@gmail.com")
MAIL_PASS = os.environ.get("MAIL_PASS", "dygnpfkowoizdgni")   # 16-char Gmail App Password
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://127.0.0.1:5000")

# ── Password hashing ─────────────────────────────────────────────────────────
def hash_pw(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

# ── Email sender ─────────────────────────────────────────────────────────────
# ── Email Templates ────────────────────────────────────────────────────────────
def email_verification_template(code: str) -> str:
    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #6366f1;">Welcome to FitnessAGNT!</h2>
        <p>Your 6-digit email verification code is:</p>
        <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <h1 style="letter-spacing: 5px; margin: 0; color: #1f2937;">{code}</h1>
        </div>
        <p style="font-size: 0.9em; color: #6b7280;">This code will expire in 15 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      </body>
    </html>
    """

def email_welcome_template(name: str) -> str:
    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #6366f1;">Account Verified!</h2>
        <p>Hi {name},</p>
        <p>Your email has been successfully verified, and your FitnessAGNT account is now fully active.</p>
        <p>You can now log in and start using our AI models to track your fitness journey.</p>
        <br/>
        <p>Stay fit,</p>
        <p><strong>The FitnessAGNT Team</strong></p>
      </body>
    </html>
    """

def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an HTML email via Gmail SMTP. Returns True on success."""
    if not MAIL_USER or not MAIL_PASS:
        print(f"[WARN] MAIL_USER/MAIL_PASS not set – email to {to_email} skipped.")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"FitnessAGNT <{MAIL_USER}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html_body, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(MAIL_USER, MAIL_PASS)
            server.sendmail(MAIL_USER, to_email, msg.as_string())
        print(f"[OK] Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"[ERROR] send_email failed: {e}")
        return False

def email_welcome_template(display_name: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;padding:40px;border-radius:12px;max-width:500px;margin:auto;">
      <h2 style="color:#00e5ff;margin-bottom:4px;">FitnessAGNT</h2>
      <p style="color:#8b949e;margin-bottom:24px;">AI-Powered Fitness Prediction Suite</p>
      <h3 style="margin-bottom:12px;">Welcome aboard, {display_name}!</h3>
      <p style="line-height:1.7;">Your account has been created successfully. You now have full access to all three AI prediction tools:</p>
      <ul style="color:#8b949e;line-height:2;margin:16px 0;padding-left:20px;">
        <li><span style="color:#00e5ff;">Muscle Recovery Predictor</span> — know when to train again</li>
        <li><span style="color:#f97316;">Daily Calorie Estimator</span> — hit your nutrition targets</li>
        <li><span style="color:#10b981;">Macro &amp; Meal Plan</span> — fuel for your physique goal</li>
      </ul>
      <div style="text-align:center;margin:32px 0;">
        <a href="http://127.0.0.1:5000" style="background:linear-gradient(135deg,#00e5ff,#a855f7);color:#0d1117;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;display:inline-block;">Open FitnessAGNT</a>
      </div>
      <p style="color:#8b949e;font-size:13px;">If you didn't create this account, you can safely ignore this email.</p>
    </div>"""

def email_verification_template(code: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;padding:40px;border-radius:12px;max-width:500px;margin:auto;">
      <h2 style="color:#00e5ff;margin-bottom:8px;">FitnessAGNT</h2>
      <p style="color:#8b949e;margin-bottom:24px;">AI-Powered Fitness Predictor</p>
      <h3 style="margin-bottom:16px;">Verify your email address</h3>
      <p>Use the code below to complete your registration. It expires in <strong>15 minutes</strong>.</p>
      <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
        <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#00e5ff;">{code}</span>
      </div>
      <p style="color:#8b949e;font-size:13px;">If you didn't create a FitnessAGNT account, you can safely ignore this email.</p>
    </div>"""

def email_reset_template(reset_url: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;padding:40px;border-radius:12px;max-width:500px;margin:auto;">
      <h2 style="color:#00e5ff;margin-bottom:8px;">FitnessAGNT</h2>
      <p style="color:#8b949e;margin-bottom:24px;">AI-Powered Fitness Predictor</p>
      <h3 style="margin-bottom:16px;">Reset your password</h3>
      <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="{reset_url}" style="background:linear-gradient(135deg,#00e5ff,#a855f7);color:#0d1117;font-weight:700;font-size:16px;padding:14px 32px;border-radius:8px;text-decoration:none;display:inline-block;">Reset Password</a>
      </div>
      <p style="color:#8b949e;font-size:13px;">If you didn't request a password reset, ignore this email. Your password won't change.</p>
      <p style="color:#8b949e;font-size:11px;word-break:break-all;">Link: {reset_url}</p>
    </div>"""

# ── Admin seed ───────────────────────────────────────────────────────────────
def init_admin():
    """Seed default admin if not present."""
    try:
        res = db.table("admins").select("id").eq("email", "sreedevpanoop@gmail.com").execute()
        if not res.data:
            db.table("admins").insert({
                "email": "sreedevpanoop@gmail.com",
                "password_hash": hash_pw("admin@211")
            }).execute()
            print("[OK] Default admin seeded: sreedevpanoop@gmail.com / admin@211")
        else:
            print("[OK] Admin account exists.")
    except Exception as e:
        print(f"[WARN] Admin init error: {e}")

# ── Load ML artifacts: Model 1 – Muscle Recovery ────────────────────────────
with open(os.path.join(BASE_DIR, "recovery_model.pkl"), "rb") as f:
    recovery_model = pickle.load(f)
with open(os.path.join(BASE_DIR, "recovery_scaler.pkl"), "rb") as f:
    recovery_scaler = pickle.load(f)
with open(os.path.join(BASE_DIR, "recovery_columns.pkl"), "rb") as f:
    recovery_columns = pickle.load(f)
print("[OK] Recovery model loaded.")

# ── Load ML artifacts: Model 2 – Calorie Predictor ──────────────────────────
calorie_model = joblib.load(os.path.join(BASE_DIR, "calorie_predictor_model.pkl"))
print("[OK] Calorie model loaded.")

# ── Load ML artifacts: Model 3 – Macro & Meal Plan ──────────────────────────
macro_model   = joblib.load(os.path.join(BASE_DIR, "macro_model.pkl"))
macro_scaler  = joblib.load(os.path.join(BASE_DIR, "macro_scaler.pkl"))
macro_columns = joblib.load(os.path.join(BASE_DIR, "macro_columns.pkl"))
print("[OK] Macro model loaded.")

# ── DB Helpers ───────────────────────────────────────────────────────────────
def log_prediction_to_db(email: str, model_type: str, input_data: dict, result_data: dict):
    """Log a prediction result for a logged-in user (skip guests)."""
    if not email or email.lower() == "guest":
        return
    try:
        db.table("prediction_logs").insert({
            "email":       email,
            "model_type":  model_type,
            "input_data":  input_data,
            "result_data": result_data
        }).execute()
        # Increment prediction_count atomically
        res = db.table("users").select("prediction_count").eq("email", email).execute()
        if res.data:
            current = res.data[0].get("prediction_count") or 0
            db.table("users").update({"prediction_count": current + 1}).eq("email", email).execute()
    except Exception as e:
        print(f"[WARN] log_prediction_to_db error: {e}")

# ── Static file serving ──────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)

# ══════════════════════════════════════════════════════════════════════════════
#  AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/api/register", methods=["POST"])
def register():
    data     = request.get_json(force=True)
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"success": False, "error": "Email and password required."}), 400
    if "@" not in email or "." not in email:
        return jsonify({"success": False, "error": "Please enter a valid email address."}), 400
    
    # Restrict to working domains
    allowed_domains = {"gmail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com", "proton.me", "zoho.com"}
    domain = email.split("@")[-1].lower()
    if domain not in allowed_domains:
        return jsonify({"success": False, "error": f"Please use a popular email provider (e.g. gmail.com, yahoo.com). '{domain}' is not supported."}), 400

    if len(password) < 6:
        return jsonify({"success": False, "error": "Password must be at least 6 characters."}), 400

    # Check if a verified account already exists
    existing = db.table("users").select("id, is_verified").eq("email", email).execute()
    if existing.data:
        user_row = existing.data[0]
        if user_row.get("is_verified"):
            return jsonify({"success": False, "error": "An account with this email already exists."}), 409
        else:
            # Account exists but is unverified — update password and resend OTP
            db.table("users").update({"password_hash": hash_pw(password)}).eq("email", email).execute()
            _send_verification_code(email)
            return jsonify({
                "success": True,
                "pending_verification": True,
                "email": email,
                "message": "A verification code has been sent to your email."
            })

    # Optional profile fields collected at registration
    age    = data.get("age")
    gender = data.get("gender")
    height = data.get("height")
    weight = data.get("weight")

    new_user = {
        "email":            email,
        "password_hash":    hash_pw(password),
        "is_verified":      False,   # Must verify via OTP before accessing the app
        "prediction_count": 0,
    }
    if age    is not None: new_user["age"]    = int(age)
    if gender is not None: new_user["gender"] = str(gender)
    if height is not None: new_user["height"] = float(height)
    if weight is not None: new_user["weight"] = float(weight)

    db.table("users").insert(new_user).execute()

    # Send OTP verification code
    _send_verification_code(email)

    return jsonify({
        "success": True,
        "pending_verification": True,
        "email": email,
        "message": "A 6-digit verification code has been sent to your email."
    })

def _send_verification_code(email: str) -> bool:
    """Generate a 6-digit code, store it, and email it."""
    code = str(random.randint(100000, 999999))
    expires_at = (datetime.datetime.utcnow() + datetime.timedelta(minutes=15)).isoformat()
    # Invalidate old unused codes for this email
    db.table("email_verifications").update({"used": True}).eq("email", email).eq("used", False).execute()
    db.table("email_verifications").insert({
        "email":      email,
        "code":       code,
        "expires_at": expires_at,
        "used":       False
    }).execute()
    return send_email(email, "FitnessAGNT – Your Verification Code", email_verification_template(code))

@app.route("/api/verify_email", methods=["POST"])
def verify_email():
    data  = request.get_json(force=True)
    email = data.get("email", "").strip().lower()
    code  = data.get("code", "").strip()

    if not email or not code:
        return jsonify({"success": False, "error": "Email and code required."}), 400

    res = (
        db.table("email_verifications")
          .select("id, code, expires_at, used")
          .eq("email", email)
          .eq("used", False)
          .order("expires_at", desc=True)
          .limit(1)
          .execute()
    )
    if not res.data:
        return jsonify({"success": False, "error": "No active verification code found. Please register again."}), 400

    row = res.data[0]
    # Check expiry
    expires_at = datetime.datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    now_utc    = datetime.datetime.now(datetime.timezone.utc)
    if now_utc > expires_at:
        return jsonify({"success": False, "error": "Code expired. Please request a new one."}), 400
    if row["code"] != code:
        return jsonify({"success": False, "error": "Incorrect code. Please try again."}), 400

    # Mark code used + verify user
    db.table("email_verifications").update({"used": True}).eq("id", row["id"]).execute()
    db.table("users").update({"is_verified": True}).eq("email", email).execute()

    # Send welcome email now that the account is fully verified
    display_name = email.split("@")[0]
    send_email(email, "Welcome to FitnessAGNT!", email_welcome_template(display_name))

    return jsonify({"success": True, "username": email, "display_name": display_name})

# ── Resend OTP code ───────────────────────────────────────────────────────────
@app.route("/api/resend_code", methods=["POST"])
def resend_code():
    """Resend a fresh OTP for an email that is pending verification."""
    data  = request.get_json(force=True)
    email = data.get("email", "").strip().lower()
    if not email:
        return jsonify({"success": False, "error": "Email required."}), 400
    # Only allow resend for unverified accounts
    user_res = db.table("users").select("is_verified").eq("email", email).execute()
    if not user_res.data:
        return jsonify({"success": False, "error": "No account found for this email."}), 404
    if user_res.data[0].get("is_verified"):
        return jsonify({"success": False, "error": "This account is already verified."}), 400
    sent = _send_verification_code(email)
    if sent:
        return jsonify({"success": True, "message": "A new code has been sent to your email."})
    return jsonify({"success": False, "error": "Failed to send email. Please try again."}), 500


@app.route("/api/login", methods=["POST"])
def login():
    data     = request.get_json(force=True)
    email    = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"success": False, "error": "Email and password required."}), 400

    # ── Check admin table first ──────────────────────────────────────────────
    admin_res = db.table("admins").select("email, password_hash").eq("email", email).execute()
    if admin_res.data:
        admin = admin_res.data[0]
        if admin["password_hash"] != hash_pw(password):
            return jsonify({"success": False, "error": "Invalid email or password."}), 401
        # Admin login success
        db.table("login_history").insert({
            "email":      email,
            "ip_address": request.remote_addr
        }).execute()
        display_name = email.split("@")[0]
        return jsonify({
            "success":      True,
            "role":         "admin",
            "token":        ADMIN_TOKEN,
            "username":     email,
            "display_name": display_name
        })

    # ── Check users table ────────────────────────────────────────────────────
    user_res = db.table("users").select("email, password_hash, is_verified").eq("email", email).execute()
    if not user_res.data:
        return jsonify({"success": False, "error": "Invalid email or password."}), 401

    user = user_res.data[0]
    if user["password_hash"] != hash_pw(password):
        return jsonify({"success": False, "error": "Invalid email or password."}), 401
    if not user.get("is_verified"):
        # Account exists but email is unverified — resend OTP and block login
        _send_verification_code(email)
        return jsonify({
            "success": False,
            "pending_verification": True,
            "email": email,
            "error": "Please verify your email. A new code has been sent."
        }), 403

    # Update last_login
    db.table("users").update({"last_login": datetime.datetime.utcnow().isoformat()}).eq("email", email).execute()
    db.table("login_history").insert({"email": email, "ip_address": request.remote_addr}).execute()

    display_name = email.split("@")[0]
    return jsonify({
        "success":      True,
        "role":         "user",
        "username":     email,
        "display_name": display_name
    })

# ── Forgot Password ───────────────────────────────────────────────────────────
@app.route("/api/forgot_password", methods=["POST"])
def forgot_password():
    data  = request.get_json(force=True)
    email = data.get("email", "").strip().lower()
    if not email:
        return jsonify({"success": False, "error": "Email required."}), 400

    # Check user exists (don't reveal if email is registered or not for security)
    user_res = db.table("users").select("id").eq("email", email).execute()
    if user_res.data:
        token      = secrets.token_urlsafe(32)
        expires_at = (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat()
        # Invalidate old tokens
        db.table("password_resets").update({"used": True}).eq("email", email).eq("used", False).execute()
        db.table("password_resets").insert({
            "email":      email,
            "token":      token,
            "expires_at": expires_at,
            "used":       False
        }).execute()
        reset_url = f"{APP_BASE_URL}/reset_password.html?token={token}"
        send_email(email, "FitnessAGNT – Reset Your Password", email_reset_template(reset_url))

    # Always return success (prevents email enumeration)
    return jsonify({"success": True, "message": "If that email is registered, a reset link has been sent."})

@app.route("/api/reset_password", methods=["POST"])
def reset_password():
    data     = request.get_json(force=True)
    token    = data.get("token", "").strip()
    new_pass = data.get("new_password", "")

    if not token or not new_pass:
        return jsonify({"success": False, "error": "Token and new password required."}), 400
    if len(new_pass) < 6:
        return jsonify({"success": False, "error": "Password must be at least 6 characters."}), 400

    res = (
        db.table("password_resets")
          .select("id, email, expires_at, used")
          .eq("token", token)
          .execute()
    )
    if not res.data:
        return jsonify({"success": False, "error": "Invalid or expired reset link."}), 400

    row = res.data[0]
    if row.get("used"):
        return jsonify({"success": False, "error": "This reset link has already been used."}), 400

    expires_at = datetime.datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    now_utc    = datetime.datetime.now(datetime.timezone.utc)
    if now_utc > expires_at:
        return jsonify({"success": False, "error": "This reset link has expired. Please request a new one."}), 400

    email = row["email"]
    db.table("users").update({"password_hash": hash_pw(new_pass)}).eq("email", email).execute()
    db.table("password_resets").update({"used": True}).eq("id", row["id"]).execute()

    return jsonify({"success": True, "message": "Password updated successfully."})

# ── Log prediction (legacy stub) ──────────────────────────────────────────────
@app.route("/api/log_prediction", methods=["POST"])
def log_prediction():
    return jsonify({"success": True})

# ── User profile ──────────────────────────────────────────────────────────────
@app.route("/api/user/profile", methods=["GET"])
def get_user_profile():
    """Return stored profile fields for a logged-in user."""
    email = request.args.get("email", "").strip().lower()
    if not email or email == "guest":
        return jsonify({"success": False, "error": "Email required."}), 400
    res = db.table("users").select("age, gender, height, weight").eq("email", email).execute()
    if not res.data:
        return jsonify({"success": False, "error": "User not found."}), 404
    row = res.data[0]
    return jsonify({
        "success": True,
        "age":     row.get("age"),
        "gender":  row.get("gender"),
        "height":  row.get("height"),
        "weight":  row.get("weight"),
    })

@app.route("/api/user/profile", methods=["PUT"])
def update_user_profile():
    """Update profile fields for a logged-in user."""
    data  = request.get_json(force=True)
    email = data.get("email", "").strip().lower()
    if not email or email == "guest":
        return jsonify({"success": False, "error": "Email required."}), 400

    updates: dict = {}
    if data.get("age")    is not None: updates["age"]    = int(data["age"])
    if data.get("gender") is not None: updates["gender"] = str(data["gender"])
    if data.get("height") is not None: updates["height"] = float(data["height"])
    if data.get("weight") is not None: updates["weight"] = float(data["weight"])

    if not updates:
        return jsonify({"success": False, "error": "No fields to update."}), 400

    db.table("users").update(updates).eq("email", email).execute()
    return jsonify({"success": True, "message": "Profile updated."})

@app.route("/api/report_issue", methods=["POST"])
def report_issue():
    """Submit a user report to the database."""
    data = request.get_json(force=True)
    email = data.get("email", "").strip()
    issue_type = data.get("type", "Other").strip()
    description = data.get("description", "").strip()
    
    if not description:
        return jsonify({"success": False, "error": "Description required."}), 400
        
    try:
        db.table("reports").insert({
            "email": email or "Guest",
            "type": issue_type,
            "description": description
        }).execute()
        return jsonify({"success": True, "message": "Report submitted."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════════
#  ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

def require_admin(req):
    """Returns True if request has valid admin token."""
    return req.headers.get("X-Admin-Token", "") == ADMIN_TOKEN

@app.route("/api/admin/users", methods=["GET"])
def admin_users():
    if not require_admin(request):
        return jsonify({"success": False, "error": "Unauthorized"}), 403

    res = (
        db.table("users")
          .select("email, is_verified, joined_date, last_login, prediction_count, age, gender, height, weight")
          .order("joined_date", desc=True)
          .execute()
    )
    users = res.data or []
    total_predictions = sum(u.get("prediction_count", 0) or 0 for u in users)
    verified_count    = sum(1 for u in users if u.get("is_verified"))

    result = [{
        "email":            u["email"],
        "is_verified":      u.get("is_verified", False),
        "joined":           u.get("joined_date", "N/A"),
        "last_login":       u.get("last_login") or "Never",
        "prediction_count": u.get("prediction_count", 0) or 0,
        "age":              u.get("age"),
        "gender":           u.get("gender"),
        "height":           u.get("height"),
        "weight":           u.get("weight")
    } for u in users]

    return jsonify({
        "success":           True,
        "users":             result,
        "total_users":       len(users),
        "total_predictions": total_predictions,
        "verified_count":    verified_count
    })

@app.route("/api/admin/reports", methods=["GET"])
def admin_reports():
    if not require_admin(request):
        return jsonify({"success": False, "error": "Unauthorized"}), 403

    try:
        res = db.table("reports").select("id, email, type, description, created_at").order("created_at", desc=True).execute()
        return jsonify({"success": True, "reports": res.data or []})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/admin/delete_user", methods=["POST"])
def admin_delete_user():
    if not require_admin(request):
        return jsonify({"success": False, "error": "Unauthorized"}), 403

    data  = request.get_json(force=True)
    email = data.get("email", "").strip().lower()

    if email == "admin@fitnessagnt.com":
        return jsonify({"success": False, "error": "Cannot delete the admin account."}), 400

    res = db.table("users").select("id").eq("email", email).execute()
    if not res.data:
        return jsonify({"success": False, "error": "User not found."}), 404

    db.table("users").delete().eq("email", email).execute()
    return jsonify({"success": True})

@app.route("/api/admin/stats", methods=["GET"])
def admin_stats():
    """Full analytics data for the admin dashboard graphs."""
    if not require_admin(request):
        return jsonify({"success": False, "error": "Unauthorized"}), 403

    # ── All users ────────────────────────────────────────────────────────────
    users_res = db.table("users").select("email, joined_date, prediction_count, is_verified").execute()
    users     = users_res.data or []

    # ── Daily signups – last 30 days ─────────────────────────────────────────
    thirty_days_ago = (datetime.datetime.utcnow() - datetime.timedelta(days=30)).strftime("%Y-%m-%d")
    signup_by_date: dict = {}
    for u in users:
        d = (u.get("joined_date") or "")[:10]   # YYYY-MM-DD
        if d and d >= thirty_days_ago:
            signup_by_date[d] = signup_by_date.get(d, 0) + 1

    # ── Prediction breakdown by model type ───────────────────────────────────
    pred_res  = db.table("prediction_logs").select("model_type").execute()
    pred_logs = pred_res.data or []
    model_counts = {"recovery": 0, "calorie": 0, "macro": 0}
    for p in pred_logs:
        mt = p.get("model_type", "")
        if mt in model_counts:
            model_counts[mt] += 1

    # ── Recent logins ─────────────────────────────────────────────────────────
    login_res = (
        db.table("login_history")
          .select("email, logged_in_at, ip_address")
          .order("logged_in_at", desc=True)
          .limit(50)
          .execute()
    )
    recent_logins = login_res.data or []

    # ── Top 10 users by predictions ──────────────────────────────────────────
    top_users_res = (
        db.table("users")
          .select("email, prediction_count")
          .order("prediction_count", desc=True)
          .limit(10)
          .execute()
    )
    top_users = top_users_res.data or []

    # ── Verified vs unverified ────────────────────────────────────────────────
    verified_count   = sum(1 for u in users if u.get("is_verified"))
    unverified_count = len(users) - verified_count

    # ── Daily predictions – last 30 days ─────────────────────────────────────
    pred_res_full = (
        db.table("prediction_logs")
          .select("predicted_at")
          .gte("predicted_at", thirty_days_ago)
          .execute()
    )
    preds_full = pred_res_full.data or []
    preds_by_date: dict = {}
    for p in preds_full:
        d = (p.get("predicted_at") or "")[:10]
        if d:
            preds_by_date[d] = preds_by_date.get(d, 0) + 1

    return jsonify({
        "success":              True,
        "total_users":          len(users),
        "verified_users":       verified_count,
        "unverified_users":     unverified_count,
        "total_predictions":    sum(model_counts.values()),
        "signup_by_date":       signup_by_date,
        "predictions_by_date":  preds_by_date,
        "model_prediction_counts": model_counts,
        "recent_logins":        recent_logins,
        "top_users":            top_users
    })

@app.route("/api/admin/user_history", methods=["GET"])
def admin_user_history():
    """Return prediction history for a specific user (admin view)."""
    if not require_admin(request):
        return jsonify({"success": False, "error": "Unauthorized"}), 403

    email = request.args.get("email", "").strip().lower()
    if not email:
        return jsonify({"success": False, "error": "Email required."}), 400

    res = (
        db.table("prediction_logs")
          .select("model_type, input_data, result_data, predicted_at")
          .eq("email", email)
          .order("predicted_at", desc=True)
          .limit(50)
          .execute()
    )
    logs = res.data or []
    return jsonify({"success": True, "history": logs})

# ── User history endpoint ─────────────────────────────────────────────────────
@app.route("/api/user/history", methods=["GET"])
def user_history():
    """Return the progression history for a logged-in user from the new tables."""
    email = request.args.get("email", "").strip().lower()
    if not email or email == "guest":
        return jsonify({"success": False, "error": "Login required to view history."}), 401

    try:
        rec_res = db.table("recovery_history").select("recovery_hours, predicted_at").eq("email", email).order("predicted_at", desc=False).execute()
        cal_res = db.table("calorie_history").select("calories, predicted_at").eq("email", email).order("predicted_at", desc=False).execute()
        
        return jsonify({
            "success": True, 
            "recovery_history": rec_res.data or [],
            "calorie_history": cal_res.data or []
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ══════════════════════════════════════════════════════════════════════════════
#  MODEL 1 – Muscle Recovery Prediction (unchanged)
# ══════════════════════════════════════════════════════════════════════════════
@app.route("/api/predict", methods=["POST"])
def predict_recovery():
    data     = request.get_json(force=True)
    email    = data.get("username", data.get("email", "guest"))
    try:
        age          = float(data["age"])
        height_cm    = float(data["height"])
        weight_kg    = float(data["weight"])
        duration     = float(data["duration"])
        intensity    = float(data["intensity"])
        protein      = float(data["protein"])
        sleep_hours  = float(data["sleep"])
        gender       = data.get("gender", "Male")
        workout_part = data.get("workout_part", "Chest")
    except (KeyError, ValueError) as e:
        return jsonify({"success": False, "error": f"Invalid input: {e}"}), 400

    h_m = height_cm / 100.0
    bmi: float = round(float(weight_kg) / (h_m * h_m), 2)
    row = {
        "Age": age, "Height_cm": height_cm, "Weight_kg": weight_kg,
        "Workout_Duration_min": duration, "Workout_Intensity_1to10": intensity,
        "Protein_Intake_g_per_day": protein, "Sleep_Hours": sleep_hours, "BMI": bmi,
        "Gender_Male": 1 if gender == "Male" else 0,
        "Workout_Part_Arms":      1 if workout_part == "Arms"      else 0,
        "Workout_Part_Back":      1 if workout_part == "Back"      else 0,
        "Workout_Part_Chest":     1 if workout_part == "Chest"     else 0,
        "Workout_Part_Legs":      1 if workout_part == "Legs"      else 0,
        "Workout_Part_Shoulders": 1 if workout_part == "Shoulders" else 0,
    }
    input_df     = pd.DataFrame([row]).reindex(columns=recovery_columns, fill_value=0)
    input_scaled = recovery_scaler.transform(input_df)
    prediction: float = round(float(recovery_model.predict(input_scaled)[0]), 2)

    result = {"success": True, "recovery_hours": prediction, "bmi": bmi}
    log_prediction_to_db(email, "recovery", {
        "age": age, "height": height_cm, "weight": weight_kg,
        "duration": duration, "intensity": intensity, "protein": protein,
        "sleep": sleep_hours, "gender": gender, "workout_part": workout_part
    }, result)
    
    # NEW progression history insertion
    if email and email.lower() != "guest":
        try:
            db.table("recovery_history").insert({
                "email": email,
                "recovery_hours": prediction
            }).execute()
        except Exception as e:
            print(f"[WARN] Failed to insert into recovery_history: {e}")
            
    return jsonify(result)

# ══════════════════════════════════════════════════════════════════════════════
#  MODEL 2 – Daily Calorie Needs Prediction (unchanged)
# ══════════════════════════════════════════════════════════════════════════════
def calc_bmr(gender, age, height, weight):
    if gender.lower() == "male":
        return 10 * weight + 6.25 * height - 5 * age + 5
    return 10 * weight + 6.25 * height - 5 * age - 161

def calc_tdee(bmr, activity_level):
    factors = {
        "Sedentary": 1.2, "Lightly Active": 1.375,
        "Moderately Active": 1.55, "Very Active": 1.725
    }
    return bmr * factors.get(activity_level, 1.2)

def calc_exercise_calories(exercise_type, duration_mins, weight):
    burn_rates = {
        "Light Training": 4, "Cardio": 8,
        "Strength Training": 7, "Weight Training": 6
    }
    return burn_rates.get(exercise_type, 4) * duration_mins * (weight / 70)

@app.route("/api/predict_calories", methods=["POST"])
def predict_calories():
    data  = request.get_json(force=True)
    email = data.get("username", data.get("email", "guest"))
    try:
        age               = int(data["age"])
        height            = float(data["height"])
        weight            = float(data["weight"])
        target_weight     = float(data["target_weight"])
        duration_weeks    = float(data["duration_weeks"])
        gender            = data.get("gender", "Male").strip().title()
        activity_level    = data.get("activity_level", "Sedentary").strip()
        exercise_type     = data.get("exercise_type", "Light Training").strip()
        exercise_duration = float(data["exercise_duration"])
    except (KeyError, ValueError) as e:
        return jsonify({"success": False, "error": f"Invalid input: {e}"}), 400

    TITLE_MAP = {
        "sedentary": "Sedentary", "lightly active": "Lightly Active",
        "moderately active": "Moderately Active", "very active": "Very Active",
        "light training": "Light Training", "cardio": "Cardio",
        "strength training": "Strength Training", "weight training": "Weight Training",
        "male": "Male", "female": "Female"
    }
    activity_level = TITLE_MAP.get(activity_level.lower(), activity_level)
    exercise_type  = TITLE_MAP.get(exercise_type.lower(), exercise_type)
    gender         = TITLE_MAP.get(gender.lower(), gender)

    bmr               = calc_bmr(gender, age, height, weight)
    tdee              = calc_tdee(bmr, activity_level)
    exercise_calories = calc_exercise_calories(exercise_type, exercise_duration, weight)

    user_dict = {
        "Age": age, "Height_cm": height,
        "Current_Weight_kg": weight, "Weight_kg": weight,
        "Target_Weight_kg": target_weight, "Duration_Weeks": duration_weeks,
        "BMR": bmr, "TDEE": tdee,
        "Exercise_Duration_min": exercise_duration,
        "Exercise_Calories": exercise_calories,
        "Gender": gender, "Activity_Level": activity_level,
        "Exercise_Type": exercise_type
    }
    user_input = pd.DataFrame([user_dict])

    try:
        predicted_calories = float(calorie_model.predict(user_input)[0])
        if predicted_calories != predicted_calories:
            raise ValueError("Model returned NaN – check input column names")
    except Exception as e:
        return jsonify({"success": False, "error": f"Prediction error: {e}"}), 500

    goal   = "Weight Gain" if target_weight > weight else ("Weight Loss" if target_weight < weight else "Maintain Weight")
    result = {
        "success": True,
        "calories":          float(round(float(predicted_calories), 1)),
        "bmr":               float(round(float(bmr), 1)),
        "tdee":              float(round(float(tdee), 1)),
        "exercise_calories": float(round(float(exercise_calories), 1)),
        "goal": goal
    }
    log_prediction_to_db(email, "calorie", {
        "age": age, "height": height, "weight": weight,
        "target_weight": target_weight, "duration_weeks": duration_weeks,
        "gender": gender, "activity_level": activity_level,
        "exercise_type": exercise_type, "exercise_duration": exercise_duration
    }, result)
    
    # NEW progression history insertion
    if email and email.lower() != "guest":
        try:
            db.table("calorie_history").insert({
                "email": email,
                "calories": float(round(float(predicted_calories), 1))
            }).execute()
        except Exception as e:
            print(f"[WARN] Failed to insert into calorie_history: {e}")
            
    return jsonify(result)

# ══════════════════════════════════════════════════════════════════════════════
#  MODEL 3 – Macro & Meal Plan Prediction (unchanged)
# ══════════════════════════════════════════════════════════════════════════════
MEAL_PLANS = {
    ("Lean", "Cardio"):             "Oats + banana (breakfast) | Chicken salad (lunch) | Grilled fish + veggies (dinner) | Greek yogurt (snack)",
    ("Lean", "Strength Training"):  "Egg whites + toast (breakfast) | Turkey wrap (lunch) | Salmon + quinoa (dinner) | Protein shake (snack)",
    ("Lean", "Weight Training"):    "Smoothie bowl (breakfast) | Tuna salad (lunch) | Grilled chicken + sweet potato (dinner) | Almonds (snack)",
    ("Lean", "HIIT"):               "Oats + berries (breakfast) | Chicken + rice (lunch) | Stir-fry tofu + veggies (dinner) | Cottage cheese (snack)",
    ("Lean", "Mixed"):              "Scrambled eggs (breakfast) | Lentil soup (lunch) | Baked cod + broccoli (dinner) | Walnuts (snack)",
    ("Shredded", "Cardio"):         "Egg white omelette (breakfast) | Chicken breast + greens (lunch) | Tilapia + asparagus (dinner) | Casein shake (snack)",
    ("Shredded", "Strength Training"): "Protein pancakes (breakfast) | Lean beef + salad (lunch) | Grilled shrimp + cauliflower rice (dinner) | Low-fat cheese (snack)",
    ("Shredded", "Weight Training"): "Greek yogurt parfait (breakfast) | Turkey burger (no bun) (lunch) | Salmon + spinach (dinner) | Hard-boiled eggs (snack)",
    ("Shredded", "HIIT"):           "Green smoothie + protein (breakfast) | Chicken + sweet potato (lunch) | Tuna steak + salad (dinner) | Rice cakes (snack)",
    ("Shredded", "Mixed"):          "Egg whites (breakfast) | Quinoa + veggies (lunch) | Grilled chicken + asparagus (dinner) | BCAAs (snack)",
    ("Bulk", "Cardio"):             "Oats + peanut butter + banana (breakfast) | Chicken rice bowl (lunch) | Beef + pasta (dinner) | Mass gainer shake (snack)",
    ("Bulk", "Strength Training"):  "5 eggs + toast (breakfast) | Steak + rice (lunch) | Chicken thighs + mashed potato (dinner) | Whole milk + oats (snack)",
    ("Bulk", "Weight Training"):    "Avocado toast + 4 eggs (breakfast) | Ground beef tacos (lunch) | Salmon + rice + veggies (dinner) | Peanut butter sandwich (snack)",
    ("Bulk", "HIIT"):               "Large smoothie bowl (breakfast) | Beef burrito (lunch) | Whole chicken serving + pasta (dinner) | Nuts + banana (snack)",
    ("Bulk", "Mixed"):              "Big breakfast burrito (breakfast) | Chicken + pasta (lunch) | Lamb chops + potatoes (dinner) | Cheese + crackers (snack)",
}

@app.route("/api/predict_macro", methods=["POST"])
def predict_macro():
    data  = request.get_json(force=True)
    email = data.get("username", data.get("email", "guest"))
    MACRO_TITLE_MAP = {
        "sedentary": "Sedentary", "lightly active": "Lightly Active",
        "moderately active": "Moderately Active", "very active": "Very Active",
        "cardio": "Cardio", "strength training": "Strength Training",
        "weight training": "Weight Training", "hiit": "HIIT", "mixed": "Mixed",
        "lean": "Lean", "shredded": "Shredded", "bulk": "Bulk",
        "male": "Male", "female": "Female"
    }
    try:
        age      = int(data["age"])
        weight   = float(data["weight"])
        height   = float(data["height"])
        activity = MACRO_TITLE_MAP.get(data.get("activity_level", "Sedentary").strip().lower(), data.get("activity_level", "Sedentary"))
        exercise = MACRO_TITLE_MAP.get(data.get("exercise_type",  "Cardio").strip().lower(),    data.get("exercise_type",  "Cardio"))
        goal     = MACRO_TITLE_MAP.get(data.get("physique_goal",  "Lean").strip().lower(),      data.get("physique_goal",  "Lean"))
        gender   = MACRO_TITLE_MAP.get(data.get("gender",         "Male").strip().lower(),      data.get("gender",         "Male"))
    except (KeyError, ValueError) as e:
        return jsonify({"success": False, "error": f"Invalid input: {e}"}), 400

    user_df = pd.DataFrame([{
        "Age": age, "Gender": gender, "Height_cm": height,
        "Weight_kg": weight, "Activity_Level": activity,
        "Exercise_Type": exercise, "Physique_Goal": goal
    }])
    user_encoded = pd.get_dummies(user_df, drop_first=True)
    user_encoded = user_encoded.reindex(columns=macro_columns, fill_value=0)

    try:
        scaled_input = macro_scaler.transform(user_encoded)
        prediction   = macro_model.predict(scaled_input)[0]
        calories, protein, carbs, fats, fiber = [float(round(float(v), 1)) for v in prediction]
    except Exception as e:
        return jsonify({"success": False, "error": f"Prediction error: {e}"}), 500

    meal_plan = MEAL_PLANS.get(
        (goal, exercise),
        "Balanced meals with lean protein, complex carbs, and healthy fats throughout the day."
    )
    result = {
        "success": True,
        "calories": calories, "protein": protein, "carbs": carbs,
        "fats": fats, "fiber": fiber, "meal_plan": meal_plan, "goal": goal
    }
    log_prediction_to_db(email, "macro", {
        "age": age, "weight": weight, "height": height,
        "activity_level": activity, "exercise_type": exercise,
        "physique_goal": goal, "gender": gender
    }, result)
    return jsonify(result)

# ── Run ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    os.makedirs(STATIC_DIR, exist_ok=True)
    init_admin()
    app.run(debug=True, port=5000)
