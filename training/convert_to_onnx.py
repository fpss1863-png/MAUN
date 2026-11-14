# يحوّل موديل UFLD v1 (.pth) إلى lane.onnx بالصيغة التي يفهمها موقع MAUN.
# التشغيل من داخل مجلد مستودع Ultra-Fast-Lane-Detection:
#   PYTHONPATH=. python convert_to_onnx.py culane  culane_18.pth   lane.onnx
#   PYTHONPATH=. python convert_to_onnx.py tusimple tusimple_18.pth lane.onnx
import sys, torch
from model.model import parsingNet

kind, pth, out = sys.argv[1:4]
griding, rows = (200, 18) if kind == 'culane' else (100, 56)
net = parsingNet(pretrained=False, backbone='18', cls_dim=(griding + 1, rows, 4), use_aux=False).eval()
ck = torch.load(pth, map_location='cpu')
sd = {(k[7:] if k.startswith('module.') else k): v for k, v in ck['model'].items()}
print(net.load_state_dict(sd, strict=False))   # مفاتيح aux الزائدة طبيعية
x = torch.zeros(1, 3, 288, 800)
torch.onnx.export(net, x, out, opset_version=12, input_names=['input'], output_names=['output'])
print('خرج الموديل:', tuple(net(x).shape), '← المتوقع', (1, griding + 1, rows, 4))
