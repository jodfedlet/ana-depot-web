"""Seeds a LOCAL verification stack through the real STAFF API (verification data only: never run it against production).
Required environment (NO defaults: an unset variable refuses to run): API_URL, SUPABASE_URL, E2E_TARGET_CONFIRM (must equal API_URL), SUPABASE_PUBLIC_KEY, STAFF_EMAIL, STAFF_PASSWORD
(a user already bootstrapped as staff). Before it writes anything, scripts/e2e-target-guard.mjs must accept the target: explicit, confirmed, loopback, and identified as a dedicated test store
(never configured, or already carrying this seed's own store name). See e2e/storefront/README.md."""
import json, os, struct, subprocess, sys, urllib.request, zlib, uuid

# 1. Refuse to run against anything that is not positively identified as a dedicated local test target (single source of truth: the Node guard, also used by every browser suite).
_guard = subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts", "e2e-target-guard.mjs")], env=os.environ, capture_output=True, text=True)
if _guard.returncode != 0:
    sys.exit((_guard.stderr or _guard.stdout).strip() + "\nseed aborted: nothing was written.")
for _name in ("SUPABASE_PUBLIC_KEY", "STAFF_EMAIL", "STAFF_PASSWORD"):
    if not os.environ.get(_name):
        sys.exit(f"{_name} is not set; seed aborted: nothing was written.")
API=os.environ["API_URL"].rstrip("/")+"/api/v1"; SB=os.environ["SUPABASE_URL"].rstrip("/")+"/auth/v1"; PK=os.environ["SUPABASE_PUBLIC_KEY"]
def http(method, url, body=None, headers=None, raw=False):
    h={"Accept":"application/json"}; h.update(headers or {})
    data=None
    if body is not None and not raw: data=json.dumps(body).encode(); h["Content-Type"]="application/json"
    if raw: data=body
    req=urllib.request.Request(url,data=data,method=method,headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            t=r.read(); return r.status,(json.loads(t) if t and r.headers.get("content-type","").startswith("application/json") else t)
    except urllib.error.HTTPError as e:
        t=e.read(); raise SystemExit(f"{method} {url} -> {e.code} {t[:600]!r}")
_,tok=http("POST",f"{SB}/token?grant_type=password",{"email":os.environ["STAFF_EMAIL"],"password":os.environ["STAFF_PASSWORD"]},{"apikey":PK})
A={"Authorization":"Bearer "+tok["access_token"]}
def api(m,p,b=None,extra=None): return http(m,API+p,b,{**A,**(extra or {})})[1]
def key(): return {"Idempotency-Key":str(uuid.uuid4())}

# pickup
api("PUT","/admin/settings/pickup",{"enabled":True,"unavailableMessage":{"fr":"","ht":""},"version":None,"holdPeriodDays":None,
 "location":{"storeName":"Magasin de vérification (données de test)","addressLine":"1, rue de l'Essai","city":"Port-au-Prince","region":"Ouest","country":"HT","phone":"+509 0000 0000","email":"test@example.test",
  "additionalLocationInfo":{"fr":"Adresse fictive pour la vérification.","ht":"Adrès fo pou verifikasyon an."},
  "schedule":[{"day":d,"open":d<=5,"from":"09:00" if d<=5 else "","to":"17:00" if d<=5 else ""} for d in range(1,8)],"closureInfo":{"fr":"","ht":""}},
 "instructions":{"general":{"fr":"Apportez votre référence de réservation.","ht":"Pote nimewo referans rezèvasyon w lan."},"contact":{"fr":"","ht":""},"accepted":{"fr":"","ht":""},"ready":{"fr":"Vos produits sont prêts.","ht":"Pwodwi w yo pare."},"policy":{"fr":"","ht":""}}})

def cat(slug,fr,ht,order,attrs):
    return api("POST","/admin/categories",{"slug":slug,"name":{"fr":fr,"ht":ht},"description":{"fr":f"{fr} : produits de vérification","ht":f"{ht}: pwodwi verifikasyon"},"active":True,"displayOrder":order,"attributes":attrs})
def attr(k,fr,ht,opts,axis=False,order=1):
    return {"key":k,"label":{"fr":fr,"ht":ht},"type":"CHOICE","required":False,"filterable":True,"variantAxis":axis,"displayOrder":order,"options":[{"code":c,"label":{"fr":a,"ht":b},"displayOrder":i+1} for i,(c,a,b) in enumerate(opts)]}
home=cat("maison","Maison","Lakay",1,[attr("color","Couleur","Koulè",[("rouge","Rouge","Wouj"),("bleu","Bleu","Ble")])])
clothes=cat("vetements","Vêtements","Rad",2,[attr("size","Taille","Gwosè",[("s","S","S"),("m","M","M"),("l","L","L")],axis=True)])
tools=cat("outils","Outils","Zouti",3,[attr("material","Matériau","Materyèl",[("acier","Acier","Asye"),("bois","Bois","Bwa")])])
def opt(c,attrkey,code):
    a=[x for x in c["attributes"] if x["key"]==attrkey][0]; return a["id"],[o for o in a["options"] if o["code"]==code][0]["id"]

def png(rgb,w=480,h=480):
    rows=b"".join(b"\x00"+bytes(rgb)*w for _ in range(h))
    def chunk(t,d): c=struct.pack(">I",len(d))+t+d; return c+struct.pack(">I",zlib.crc32(t+d)&0xffffffff)
    return b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(rows))+chunk(b"IEND",b"")
def image(pid,rgb):
    data=png(rgb)
    t=api("POST",f"/admin/products/{pid}/images/uploads",{"contentType":"image/png","sizeBytes":len(data)},key())
    u=t["upload"]; http("PUT",u["url"],data,u["headers"],raw=True)
    api("POST",f"/admin/products/{pid}/images/uploads/{t['uploadId']}/complete")
def price(cur,retail,sale=None,minq=1,tiers=None):
    return {"currency":cur,"retail":retail,"sale":sale,"minOrderQuantity":minq,"wholesaleEnabled":bool(tiers),"tiers":[{"minQuantity":q,"unitPrice":p} for q,p in (tiers or [])],"active":True}
def product(sku,fr,ht,c,unit,prices,descr,brand=None,variants=None,attributes=None):
    return api("POST","/admin/products",{"sku":sku,"categoryId":c["id"],"name":{"fr":fr,"ht":ht},"description":{"fr":descr[0],"ht":descr[1]},"brand":brand,"unit":unit,"status":"ACTIVE","prices":prices,"variants":variants or [],"attributes":attributes or []})
def stock(pid,n,variant=None,thr=None): api("POST","/admin/inventory",{"productId":pid,"variantId":variant,"tracked":True,"initialOnHand":n,"lowStockThreshold":thr})

p1=product("CAS-001","Casserole en aluminium","Chodyè an aliminyòm",home,"SET",[price("HTG","2800.00",tiers=[(6,"2500.00")])],("Casserole robuste.\n\nProduit de vérification.","Chodyè solid.\n\nPwodwi verifikasyon."),"Ana Test",
   attributes=[{"attributeId":opt(home,"color","rouge")[0],"optionId":opt(home,"color","rouge")[1]}])
stock(p1["id"],40); image(p1["id"],(200,60,50))
sid=opt(clothes,"size","s"); mid=opt(clothes,"size","m"); lid=opt(clothes,"size","l")
p2=product("TEE-001","T-shirt en coton","Tishèt koton",clothes,"UNIT",
   [price("HTG","1500.00",tiers=[(10,"1300.00")]),price("USD","12.00","10.50",tiers=[(10,"9.00")])],("T-shirt doux, coupe droite.","Tishèt dou."),"Ana Test",
   variants=[{"sku":"TEE-001-S","axisValues":{sid[0]:sid[1]}},{"sku":"TEE-001-M","axisValues":{mid[0]:mid[1]}},{"sku":"TEE-001-L","axisValues":{lid[0]:lid[1]},"retailOverrides":{"USD":"13.00"}}])
vs={v["sku"]:v["id"] for v in p2["variants"]}
stock(p2["id"],10,vs["TEE-001-S"],3); stock(p2["id"],2,vs["TEE-001-M"],3); stock(p2["id"],0,vs["TEE-001-L"],3)
image(p2["id"],(40,90,180)); image(p2["id"],(60,160,100))
p3=product("MAR-001","Marteau de menuisier","Mato bwa",tools,"UNIT",[price("USD","15.00",tiers=[(10,"13.50")])],("Marteau 500 g.","Mato 500 g."),"Ana Test",
   attributes=[{"attributeId":opt(tools,"material","acier")[0],"optionId":opt(tools,"material","acier")[1]}])
stock(p3["id"],5); image(p3["id"],(90,90,90))
p4=product("LAM-001","Lampe solaire","Lanp solè",home,"UNIT",[price("HTG","1200.00")],("Éclaire sans électricité.","Limen san kouran."),None)
stock(p4["id"],0)
p5=product("TAP-001","Tapis de sol","Tapi atè",home,"UNIT",[price("HTG","3500.00"),price("USD","28.00")],("Tapis résistant.","Tapi solid."),None)
stock(p5["id"],25)
print(json.dumps({"products":{x["sku"]:x["id"] for x in (p1,p2,p3,p4,p5)},"variants":vs}))

# 14 filler products so the catalog has more than one page (12 per page)
cats=api("GET","/admin/categories?size=50")["items"]
home=[c for c in cats if c["slug"]=="maison"][0]
for i in range(1,15):
    p=api("POST","/admin/products",{"sku":f"FIL-{i:03d}","categoryId":home["id"],"name":{"fr":f"Article de test {i:02d}","ht":f"Atik tès {i:02d}"},"description":{"fr":"Filler","ht":"Filler"},"unit":"UNIT","status":"ACTIVE",
      "prices":[{"currency":"HTG","retail":f"{100+i}.00","minOrderQuantity":1,"wholesaleEnabled":False,"tiers":[],"active":True}],"variants":[],"attributes":[]})
    api("POST","/admin/inventory",{"productId":p["id"],"tracked":True,"initialOnHand":100})
print("filler ok")
