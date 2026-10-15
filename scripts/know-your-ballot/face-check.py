#!/usr/bin/env python3
"""Is this image a headshot of one person? Prints "yes" or "no".

A campaign site labels many images with the candidate's name: flyers, QR
codes, logos, family photos, newspaper clippings. Only an image with exactly
one clear face (at least a fifth of the image's width, with no second face
anywhere near that size) is a headshot. OpenCV's stock frontal-face detector
is enough to tell those apart; a photo it can't see a face in is passed over,
which costs a few real portraits but never admits a flyer.

Usage: face-check.py <image> ...   (one line per image, in order)
Needs opencv-python-headless 4.x (pip install "opencv-python-headless<5").
"""
import sys

import cv2

MIN_FACE = 0.22  # of the image's width
casc = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

for path in sys.argv[1:]:
    img = cv2.imread(path)
    if img is None:
        print('no')
        continue
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    w = gray.shape[1]
    faces = casc.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(max(20, w // 12), max(20, w // 12)))
    widths = sorted((fw / w for (_, _, fw, _) in faces), reverse=True)
    print('yes' if widths and widths[0] >= MIN_FACE and (len(widths) == 1 or widths[1] < widths[0] / 2) else 'no')
