"""
audit_logs/report_generator.py
DLMS – Riba & Company Limited

Generates downloadable reports from AuditTrail and ThreatAlert data.

Public API
----------
generate_pdf_report(queryset, title, date_from, date_to, requested_by) → bytes
    Returns PDF binary. Uses ReportLab.

generate_csv_report(queryset) → str
    Returns CSV string. Uses Python stdlib csv module.

generate_alert_summary_pdf(stats, date_from, date_to, requested_by) → bytes
    Generates a management-level security summary PDF.
"""

import csv
import io
import logging
from datetime import datetime

logger = logging.getLogger("dlms.reports")


# ─────────────────────────────────────────────
#  Colour palette (ReportLab uses 0-1 RGB)
# ─────────────────────────────────────────────

def _rgb(hex_color: str):
    """Convert hex colour string to ReportLab (r, g, b) tuple (0-1 range)."""
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))


NAVY   = _rgb("0D2137")
GOLD   = _rgb("C8960C")
TEAL   = _rgb("1A6B8A")
RED    = _rgb("C0392B")
GREEN  = _rgb("1E8449")
LGRAY  = _rgb("F5F7FA")
DGRAY  = _rgb("5D6D7E")
WHITE  = _rgb("FFFFFF")
BLACK  = _rgb("000000")
BORDER = _rgb("DEE4EC")


# ─────────────────────────────────────────────
#  CSV Export
# ─────────────────────────────────────────────

def generate_csv_report(queryset) -> bytes:
    """
    Exports AuditTrail queryset as CSV bytes (UTF-8 with BOM for Excel).
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "ID", "Timestamp", "Event Type", "Event",
        "Actor Email", "Actor Name", "Actor Role",
        "Target User", "Asset Name", "Asset Level",
        "Alert Code", "Description", "IP Address", "Session ID",
    ])

    for entry in queryset.select_related(
        "actor", "actor__role", "target_user", "data_asset", "alert"
    ):
        writer.writerow([
            entry.id,
            entry.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            entry.event_type,
            entry.get_event_type_display(),
            getattr(entry.actor, "email",     "—"),
            getattr(entry.actor, "full_name", "—"),
            getattr(getattr(entry.actor, "role", None), "name", "—"),
            getattr(entry.target_user, "full_name", "—"),
            getattr(entry.data_asset,  "name",      "—"),
            getattr(entry.data_asset,  "classification", "—"),
            getattr(entry.alert,       "alert_code",     "—"),
            entry.description[:200],
            entry.ip_address or "—",
            entry.session_id or "—",
        ])

    # Return UTF-8 with BOM so Excel opens it correctly
    return ("\ufeff" + output.getvalue()).encode("utf-8")


# ─────────────────────────────────────────────
#  PDF — Audit Trail Report
# ─────────────────────────────────────────────

def generate_pdf_report(
    queryset,
    title: str = "Audit Trail Report",
    date_from: str = "",
    date_to: str = "",
    requested_by: str = "System",
) -> bytes:
    """
    Generates a full audit trail PDF report.
    Falls back gracefully if ReportLab is not installed.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle, Paragraph,
            Spacer, HRFlowable,
        )
        from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
    except ImportError:
        logger.error("ReportLab not installed. pip install reportlab")
        return b""

    buffer = io.BytesIO()
    doc    = SimpleDocTemplate(
        buffer,
        pagesize  = landscape(A4),
        leftMargin  = 15 * mm,
        rightMargin = 15 * mm,
        topMargin   = 20 * mm,
        bottomMargin= 15 * mm,
    )

    styles = getSampleStyleSheet()
    navy_c  = colors.HexColor("#0D2137")
    gold_c  = colors.HexColor("#C8960C")
    teal_c  = colors.HexColor("#1A6B8A")
    lgray_c = colors.HexColor("#F5F7FA")
    dgray_c = colors.HexColor("#5D6D7E")
    red_c   = colors.HexColor("#C0392B")

    title_style = ParagraphStyle("DLMSTitle",
        fontSize=18, textColor=navy_c, fontName="Helvetica-Bold",
        spaceAfter=4, alignment=TA_LEFT)
    sub_style   = ParagraphStyle("DLMSSub",
        fontSize=10, textColor=dgray_c, fontName="Helvetica",
        spaceAfter=2, alignment=TA_LEFT)
    cell_style  = ParagraphStyle("DLMSCell",
        fontSize=7, textColor=navy_c, fontName="Helvetica",
        leading=9, wordWrap="CJK")
    muted_cell  = ParagraphStyle("DLMSMuted",
        fontSize=7, textColor=dgray_c, fontName="Helvetica", leading=9)

    # ── Fetch data
    entries = list(queryset.select_related(
        "actor", "actor__role", "target_user", "data_asset", "alert"
    )[:500])   # cap at 500 rows for PDF legibility

    # ── Page header builder
    def on_page(canvas, doc):
        canvas.saveState()
        # Navy header bar
        canvas.setFillColor(navy_c)
        canvas.rect(0, A4[0] - 18*mm, landscape(A4)[0], 18*mm, fill=1, stroke=0)
        # Gold accent line
        canvas.setFillColor(gold_c)
        canvas.rect(0, A4[0] - 20.5*mm, landscape(A4)[0], 2.5*mm, fill=1, stroke=0)
        # Header text
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawString(15*mm, A4[0] - 13*mm, "RIBA & COMPANY LIMITED — DLMS")
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(gold_c)
        canvas.drawString(15*mm, A4[0] - 17*mm, f"Data Loss Management System  |  {title}")
        # Page number
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(
            landscape(A4)[0] - 15*mm, A4[0] - 14*mm,
            f"Page {doc.page}  |  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}  |  By: {requested_by}"
        )
        canvas.restoreState()

    # ── Build story
    story = []

    # Title block
    story.append(Spacer(1, 6*mm))
    story.append(Paragraph(title, title_style))
    period = f"{date_from} — {date_to}" if date_from or date_to else "All time"
    story.append(Paragraph(f"Period: {period}   |   Records: {len(entries)}   |   Requested by: {requested_by}", sub_style))
    story.append(HRFlowable(width="100%", thickness=1, color=gold_c, spaceAfter=6))

    if not entries:
        story.append(Paragraph("No audit records found for the selected period.", sub_style))
    else:
        # Table header
        col_headers = [
            Paragraph("<b>Timestamp</b>",   cell_style),
            Paragraph("<b>Event</b>",       cell_style),
            Paragraph("<b>Actor</b>",       cell_style),
            Paragraph("<b>Role</b>",        cell_style),
            Paragraph("<b>Asset</b>",       cell_style),
            Paragraph("<b>IP Address</b>",  cell_style),
            Paragraph("<b>Description</b>", cell_style),
        ]

        # Table data
        col_widths = [35*mm, 30*mm, 35*mm, 22*mm, 35*mm, 28*mm, None]

        table_data = [col_headers]
        for i, entry in enumerate(entries):
            # Row colour based on event category
            event_type = entry.event_type
            if "FAIL" in event_type or "DELETE" in event_type or "SUSPEND" in event_type:
                row_bg = colors.HexColor("#FFF5F5")
            elif "AUTH_LOGIN" in event_type or "RESOLVED" in event_type:
                row_bg = colors.HexColor("#F0FFF4")
            elif i % 2 == 0:
                row_bg = lgray_c
            else:
                row_bg = colors.white

            desc = entry.description[:80] + "…" if len(entry.description) > 80 else entry.description

            table_data.append([
                Paragraph(entry.timestamp.strftime("%Y-%m-%d\n%H:%M:%S"), muted_cell),
                Paragraph(entry.get_event_type_display(), cell_style),
                Paragraph(getattr(entry.actor, "email", "System"), cell_style),
                Paragraph(getattr(getattr(entry.actor, "role", None), "name", "—"), muted_cell),
                Paragraph(getattr(entry.data_asset, "name", "—")[:30], muted_cell),
                Paragraph(entry.ip_address or "—", muted_cell),
                Paragraph(desc, cell_style),
            ])

        tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle([
            # Header row
            ("BACKGROUND",  (0,0), (-1,0),  navy_c),
            ("TEXTCOLOR",   (0,0), (-1,0),  colors.white),
            ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,0),  7.5),
            ("TOPPADDING",  (0,0), (-1,0),  5),
            ("BOTTOMPADDING",(0,0),(-1,0),  5),
            # Body
            ("FONTSIZE",    (0,1), (-1,-1), 7),
            ("TOPPADDING",  (0,1), (-1,-1), 3),
            ("BOTTOMPADDING",(0,1),(-1,-1), 3),
            ("LEFTPADDING", (0,0), (-1,-1), 4),
            ("RIGHTPADDING",(0,0), (-1,-1), 4),
            # Alternating rows handled per-row above via ROWBACKGROUNDS
            ("GRID",        (0,0), (-1,-1), 0.25, colors.HexColor("#DEE4EC")),
            ("VALIGN",      (0,0), (-1,-1), "TOP"),
            # Gold accent on header bottom
            ("LINEBELOW",   (0,0), (-1,0),  1.5, gold_c),
        ]))

        story.append(tbl)

    story.append(Spacer(1, 8*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#DEE4EC")))
    story.append(Paragraph(
        f"<font color='#6B7C93' size='7'>Riba &amp; Company Limited — DLMS v1.0 — "
        f"This report is confidential and intended for authorised personnel only. "
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}</font>",
        ParagraphStyle("footer", fontSize=7, textColor=dgray_c, alignment=TA_CENTER)
    ))

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buffer.getvalue()


# ─────────────────────────────────────────────
#  PDF — Security Summary Report
# ─────────────────────────────────────────────

def generate_alert_summary_pdf(
    stats: dict,
    date_from: str = "",
    date_to: str = "",
    requested_by: str = "System",
) -> bytes:
    """
    Management-level one-page security summary PDF.
    Shows KPIs, alert breakdown, top risky users.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.platypus import (
            SimpleDocTemplate, Table, TableStyle,
            Paragraph, Spacer, HRFlowable,
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
    except ImportError:
        return b""

    buffer = io.BytesIO()
    doc    = SimpleDocTemplate(buffer, pagesize=A4,
                               leftMargin=20*mm, rightMargin=20*mm,
                               topMargin=25*mm, bottomMargin=20*mm)

    navy_c  = colors.HexColor("#0D2137")
    gold_c  = colors.HexColor("#C8960C")
    teal_c  = colors.HexColor("#1A6B8A")
    lgray_c = colors.HexColor("#F5F7FA")
    dgray_c = colors.HexColor("#5D6D7E")
    red_c   = colors.HexColor("#C0392B")

    h1 = ParagraphStyle("h1", fontSize=20, textColor=navy_c, fontName="Helvetica-Bold",
                         spaceAfter=4)
    h2 = ParagraphStyle("h2", fontSize=13, textColor=teal_c, fontName="Helvetica-Bold",
                         spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("body", fontSize=9, textColor=navy_c, fontName="Helvetica",
                           leading=13, spaceAfter=4)
    muted = ParagraphStyle("muted", fontSize=8, textColor=dgray_c, fontName="Helvetica")

    story = []

    # ── Cover block
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("RIBA & COMPANY LIMITED", ParagraphStyle("co",
        fontSize=11, textColor=dgray_c, fontName="Helvetica", spaceAfter=2)))
    story.append(Paragraph("Security Summary Report", h1))
    story.append(Paragraph(f"Data Loss Management System  |  Period: {date_from} — {date_to}", muted))
    story.append(HRFlowable(width="100%", thickness=2, color=gold_c, spaceAfter=10))

    # ── KPI cards
    story.append(Paragraph("Key Performance Indicators", h2))

    kpis = [
        ["Total Events", str(stats.get("total_events", 0)),
         "Open Alerts", str(stats.get("total_open", 0))],
        ["Critical Alerts", str(stats.get("total_critical", 0)),
         "Auto-Blocked Users", str(stats.get("auto_blocked", 0))],
        ["Failed Logins", str(stats.get("failed_logins", 0)),
         "Avg Resolve Time", f"{stats.get('avg_resolve_time','—')} min"],
    ]

    for row in kpis:
        tbl_data = [[
            Paragraph(f"<b>{row[0]}</b><br/><font size='18' color='#0D2137'>{row[1]}</font>",
                      ParagraphStyle("kpi", fontSize=9, fontName="Helvetica", leading=20)),
            Paragraph(f"<b>{row[2]}</b><br/><font size='18' color='#0D2137'>{row[3]}</font>",
                      ParagraphStyle("kpi", fontSize=9, fontName="Helvetica", leading=20)),
        ]]
        t = Table(tbl_data, colWidths=[85*mm, 85*mm])
        t.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,-1), lgray_c),
            ("GRID",        (0,0), (-1,-1), 0.5,  colors.HexColor("#DEE4EC")),
            ("TOPPADDING",  (0,0), (-1,-1), 8),
            ("BOTTOMPADDING",(0,0),(-1,-1), 8),
            ("LEFTPADDING", (0,0), (-1,-1), 12),
            ("VALIGN",      (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(t)
        story.append(Spacer(1, 2*mm))

    # ── Alert breakdown by type
    if stats.get("by_type"):
        story.append(Spacer(1, 4*mm))
        story.append(Paragraph("Alert Breakdown by Type (Last 7 Days)", h2))
        header = [
            Paragraph("<b>Alert Type</b>", ParagraphStyle("h", fontSize=8,
                fontName="Helvetica-Bold", textColor=colors.white)),
            Paragraph("<b>Count</b>", ParagraphStyle("h", fontSize=8,
                fontName="Helvetica-Bold", textColor=colors.white, alignment=TA_CENTER)),
        ]
        rows = [header]
        for i, item in enumerate(stats["by_type"][:10]):
            rows.append([
                Paragraph(item["alert_type"].replace("_", " "), body),
                Paragraph(str(item["count"]),
                    ParagraphStyle("cnt", fontSize=9, fontName="Helvetica-Bold",
                                   alignment=TA_CENTER, textColor=teal_c)),
            ])

        bt = Table(rows, colWidths=[140*mm, 30*mm])
        bt.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,0),  navy_c),
            ("BACKGROUND",  (0,1), (-1,-1), lgray_c),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[lgray_c, colors.white]),
            ("GRID",        (0,0), (-1,-1), 0.5,  colors.HexColor("#DEE4EC")),
            ("TOPPADDING",  (0,0), (-1,-1), 5),
            ("BOTTOMPADDING",(0,0),(-1,-1), 5),
            ("LEFTPADDING", (0,0), (-1,-1), 8),
            ("LINEBELOW",   (0,0), (-1,0),  1,    gold_c),
        ]))
        story.append(bt)

    # Footer
    story.append(Spacer(1, 10*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#DEE4EC")))
    story.append(Paragraph(
        f"Confidential — Riba & Company Limited — DLMS v1.0 — "
        f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} by {requested_by}",
        ParagraphStyle("foot", fontSize=7, textColor=dgray_c, alignment=TA_CENTER)
    ))

    doc.build(story)
    return buffer.getvalue()
