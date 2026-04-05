FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY src ./src
COPY .env.example ./.env.example

RUN cmake -S /app/src/native -B /app/src/native/build \
   && cmake --build /app/src/native/build \
   && cp /app/src/native/build/flight_parser*.so /app/src/native/ \
   && rm -rf /app/src/native/build

WORKDIR /app/src

EXPOSE 8000

CMD ["python", "main.py"]
