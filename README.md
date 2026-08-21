# lgtm

LGTM画像を生成して共有します。<https://l.doany.io>

xool から分離したもので、ポスト通信簿は <https://github.com/danything/xool> にあります。

## 何をするか

画像をアップロードすると LGTM を敷き詰めて webp で保存します。長辺 960px に収め、
アニメーションはそのまま残ります。EXIF の向きも反映します。

追加する方法はふたつあり、ヘッダーの「画像を追加」から選ぶか、**ページのどこにでも
画像をドラッグ&ドロップ**します。Tenor 等のサイトから直接放り込めるのはこちらです。
ファイルを掴んだ瞬間に画面全体が受け取り先だと分かるようになっています。
生成が終わると、貼り付け用のマークダウンがそのままクリップボードに入ります。

一覧はタイルをクリックするとマークダウンをコピー、右上のボタンで拡大表示します。
自分が上げたものだけ削除でき、取り消せないので一度目のクリックでは確定待ちになります。
30件ずつ読み込みます。

`/` が新着、`/mine` が自分の分です。

## ログイン

GitHub のみです。𝕏 でのログインは xool から分離したときに廃止しました。
それ以前に 𝕏 だけで上げた画像はそのまま残っていて、管理画面では「ログインなし」と
表示されます。

## 管理画面

`/admin` で画像数・アップロード者・日別の推移と、ユーザーの権限が見られます。
開けるのは `ADMIN_GH_LOGINS` に載っている人と、そこから権限を渡された人だけで、
それ以外には 403 ではなく 404 を返します。`ADMIN_GH_LOGINS` の管理者は画面からは
剥がせないので、渡した相手が間違いだったときの戻り道になります。

## 開発環境

リバースプロキシ (genkan) を先に立ち上げておく  
<https://github.com/danything/genkan>  
下記コマンドで立ち上げ

```sh
./s.sh i
```

### 各自の設定

`compose.yml` は全員共通で、直接編集しません。手元だけの設定は
`compose.override.yml` に書きます。Docker Compose が自動で読み込んで
`compose.yml` に重ねるため、起動コマンドは変わりません。このファイルは
gitignore してあります。

```yaml
# compose.override.yml
services:
  lgtm:
    environment:
      # GitHub OAuth アプリ。コールバックは https://l.localhost/api/gh/cb
      - GITHUB_CLIENT_ID=xxxxx
      - GITHUB_CLIENT_SECRET=xxxxx
      # OAuth の state に使う任意の文字列
      - HASH=xxxxx
      # /admin を開ける人。空なら誰も開けません
      - ADMIN_GH_LOGINS=xxxxx
```

重ねた結果は下記で確認できます。

```sh
docker compose config
```
