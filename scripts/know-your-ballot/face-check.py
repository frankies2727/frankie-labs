#!/usr/bin/env python3
"""Is this image a headshot of one person? Prints "yes" or "no".

A campaign site labels many images with the candidate's name: flyers, QR
codes, logos, family photos, newspaper clippings. Only an image with exactly
one clear face (at least a sixth of the image's width, with no second face
anywhere near that size) is a headshot. OpenCV's YuNet detector
(face_detection_yunet_2023mar.onnx beside this script, from the OpenCV model
zoo, Apache-2.0) tells those apart; without the model file it falls back to
the stock Haar cascade, which misses more real portraits. A photo no face is
seen in is passed over, which costs a few real portraits but never admits a
flyer or a group photo.

Usage: face-check.py <image> ...   (one line per image, in order)
Needs opencv-python-headless 4.x (pip install "opencv-python-headless<5").
"""
import os
import sys

import cv2

MIN_FACE = 0.18  # of the image's width
MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'face_detection_yunet_2023mar.onnx')
SIDE = 640  # detect on a copy no larger than this


def yunet(img):
    """Face widths as a fraction of the image's width, largest first."""
    h, w = img.shape[:2]
    scale = SIDE / max(h, w) if max(h, w) > SIDE else 1
    small = cv2.resize(img, (int(w * scale), int(h * scale))) if scale != 1 else img
    det.setInputSize((small.shape[1], small.shape[0]))
    _, faces = det.detect(small)
    return sorted((float(f[2]) / small.shape[1] for f in (faces if faces is not None else [])), reverse=True)


def haar(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    w = gray.shape[1]
    faces = casc.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(max(20, w // 12), max(20, w // 12)))
    return sorted((fw / w for (_, _, fw, _) in faces), reverse=True)


if os.path.exists(MODEL) and hasattr(cv2, 'FaceDetectorYN'):
    det = cv2.FaceDetectorYN.create(MODEL, '', (320, 320), 0.7, 0.3, 5000)
    widths_of = yunet
else:
    casc = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    widths_of = haar

for path in sys.argv[1:]:
    img = cv2.imread(path)
    if img is None:
        print('no')
        continue
    widths = widths_of(img)
    print('yes' if widths and widths[0] >= MIN_FACE and (len(widths) == 1 or widths[1] < widths[0] / 2) else 'no')
