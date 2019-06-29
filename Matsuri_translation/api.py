from celery import Celery
from flask import Flask, request, jsonify

from Matsuri_translation.manger import execute_event

app = Flask(__name__)
app.config['CELERY_BROKER_URL'] = 'redis://localhost:6379'
app.config['CELERY_RESULT_BACKEND'] = 'redis://localhost:6379'
celery = Celery(app.name, broker=app.config['CELERY_BROKER_URL'])
celery.conf.update(app.config)


@app.route('/api/tasks', methods=['POST'])
def add_tasks():
    if request.json:
        task = {'url': request.json['url'],
                'translation': request.json['translation']}
        result = execute_event.delay(task)
        return jsonify({'img': result})


if __name__ == '__main__':
    app.run(debug=True)
