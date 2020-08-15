# redis
broker_url = 'redis://localhost:6379/0'
result_backend = 'redis://localhost:6379/0'

self_url = 'http://localhost/'

# 新特性加速，使用前请理解以下配置项含义

# Celery的任务路由，使用celery_run.sh时不要启用该路由配置，反正则需要启用该路由配置
# task_routes = {'Matsuri_translation.manager.execute_event': 'twitter',
#                 'Matsuri_translation.manager.execute_event_auto': "auto"
#                 }

# 手动启动Chrome时负责推特的Chrome对应的调试端口号，数组长度应与celery_run_twitter.sh中配置的concurrency数量相等
# 使用了任务路由但仍然希望worker启动Chrome则传None
# chrome_twitter_port=range(9222,9224)

# 手动启动Chrome时负责全自动模式的Chrome对应的调试端口号，数组长度应与celery_run_auto.sh中配置的concurrency数量相等
# 使用了任务路由但仍然希望worker启动Chrome则传None
# chrome_auto_port=range(9224,9226)
